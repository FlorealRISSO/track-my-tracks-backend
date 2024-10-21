import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import querystring from 'querystring';
import * as dotenv from 'dotenv';
import * as utils from './utils';
import { addAppUser, createTables, deleteAppUser, getAllSuperkeys, getAllUsers, getUserById, getUserByOnlyLogin, insertSuperkey, udpateUserPassphrase, updateUserToken, useSuperkey, verifySuperkey } from './db';
import { getDailySummary } from './daily';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';

dotenv.config();
const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL as string;
const FRONTEND_URL = process.env.FRONTEND_URL as string;
const JWT_SECRET = process.env.JWT_SECRET as string;
const APP_USER_ADMIN = process.env.APP_USER_ADMIN as string
const APP_USER_PASSPHRASE = process.env.APP_USER_PASSPHRASE as string

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPE = 'user-read-recently-played';
const PORT = 3000;

const REQUESTS = new Map<string, string>();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

enum AuthState {
    NEEDS_AUTH,
    READY,
    INVALID,
}

const verifyLogin = async (login: string, passphrase: string): Promise<[AuthState, string | null, boolean | null]> => {
    if (typeof passphrase !== 'string' || passphrase.length < 1) {
        return [AuthState.INVALID, null, null];
    }

    if (typeof login !== 'string' || login.length < 1) {
        return [AuthState.INVALID, null, null];
    }

    const user = await getUserByOnlyLogin(login);
    if (!user) {
        return [AuthState.INVALID, null, null];
    }

    const isSame = await utils.verifyPassword(passphrase, user.passphrase);
    if (!isSame) {
        return [AuthState.INVALID, null, null];
    }

    if (!user.token) {
        return [AuthState.NEEDS_AUTH, null, null];
    }

    const isTokenValid = await verifyToken(user.token);
    if (!isTokenValid) {
        return [AuthState.NEEDS_AUTH, null, null];
    }

    return [AuthState.READY, user.id as string, user.isadmin as boolean];
};

const verifyToken = async (token: string): Promise<boolean> => {
    const SPOTIFY_RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';
    try {
        const response = await fetch(SPOTIFY_RECENTLY_PLAYED_URL, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Error verifying token:', error);
        return false;
    }
};

type Session = {
    id: string;
    is_admin: boolean;
}

const verifySession = (token: any): [boolean, Session | null] => {
    if (!token) {
        return [false, null];
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, is_admin: boolean };
        return [true, { id: decoded.id, is_admin: decoded.is_admin }];
    } catch (error) {
        return [false, null];
    }
}

const authenticateSpotify = async (req: Request, res: Response, login: string) => {
    const state = utils.generateRandomString(16);
    const queryParams = querystring.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
		redirect_uri: `${BACKEND_URL}/callback`,
        state: state,
    });

    REQUESTS.set(state, login);
    res.json({ redirect_uri: `${SPOTIFY_AUTH_URL}?${queryParams}` });
};

const createSession = (id: string, is_admin: boolean): string => {
    const token = jwt.sign({ id, is_admin }, JWT_SECRET, { expiresIn: '3d' });
    return token;
}

app.post('/login', async (req: Request, res: Response) => {
    const { login, passphrase } = req.body;

    if (!login || !passphrase) {
        res.json({ authenticated: false });
        return;
    }

    const [auth, id, isadmin] = await verifyLogin(login, passphrase);
    switch (auth) {
        case AuthState.NEEDS_AUTH:
            await authenticateSpotify(req, res, login);
            return;
        case AuthState.INVALID:
            res.json({ authenticated: false, error: 'Invalid login or passphrase' });
            return;
        case AuthState.READY:
            const token = createSession(id!, isadmin!);
            res.cookie('session', token, { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 1000 * 60 * 60 * (24 * 3) });
            res.json({ authenticated: true, is_admin: isadmin });
            return;
    }
});

app.post('/logout', async (req: Request, res: Response) => {
    res.clearCookie('session', { path: '/' });
    res.status(200).json({ logged_out: true });
});

app.post('/register', async (req: Request, res: Response) => {
    const { login, passphrase, superkey } = req.body;

    if (!login || !passphrase || !superkey) {
        res.json({ registered: false });
        return;
    }

    const user = await getUserByOnlyLogin(login);
    if (user) {
        res.json({ registered: false, error: 'User already exists' });
        return;
    }

    const enable = await verifySuperkey(superkey);
    if (!enable) {
        res.json({ registered: false, error: 'Superkey is not enable' });
        return;
    }

    const hashed = await utils.hashPassword(passphrase);
    const id = await addAppUser(login, hashed)
    if (!id) {
        res.json({ registered: false, error: 'Internal server error' });
        return;
    }

    const isDone = await useSuperkey(superkey);
    if (!isDone) {
        res.json({ registered: false, error: 'Internal server error' });
        return;
    }

    res.json({ registered: true });
})

app.get('/verify', async (req: Request, res: Response) => {
    const [is_auth, session] = verifySession(req.cookies.session);

    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    res.json({ authenticated: true, is_admin: session?.is_admin });
});

app.get('/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state' });
    }

    const login = REQUESTS.get(state as string) as string;
    if (!login) {
        res.status(400).json({ error: 'Invalid state' });
    }

    REQUESTS.delete(state as string);

    try {
        const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            },
            body: querystring.stringify({
                code: code as string,
                redirect_uri: `${BACKEND_URL}/callback`,
                grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to retrieve token');
        }

        const tokenData = await tokenResponse.json();
        const { refresh_token, access_token } = tokenData;

        const isDome = await updateUserToken(login, access_token, refresh_token);
        if (!isDome) {
            res.status(500).json({ error: 'Internal server error' });
        }

        const user = await getUserByOnlyLogin(login);
        if (!user) {
            res.status(500).json({ error: 'Internal server error' });
        }
        const session = createSession(user.id, user.isadmin);

        res.cookie('session', session, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 1000 * 60 * 60 * (24 * 3) });
        res.redirect(FRONTEND_URL);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/users', async (req: Request, res: Response) => {

    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!session?.is_admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return
    }

    const users = await getAllUsers();
    if (!users) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json(users);
});

app.get('/superkeys', async (req: Request, res: Response) => {
    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!session?.is_admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const keys = await getAllSuperkeys();
    if (!keys) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json(keys);
});


app.post('/add-superkey', async (req: Request, res: Response) => {
    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { superkey } = req.body;
    if (!superkey || typeof superkey !== 'string' || superkey.length < 64) {
        res.json({ added: false });
        return;
    }

    const isDone = await insertSuperkey(superkey);
    if (!isDone) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json({ added: true });
});

app.delete('/delete-user/:login', async (req: Request, res: Response) => {
    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!session?.is_admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const userLogin = req.params.login;
    const isDone = await deleteAppUser(userLogin);
    if (!isDone) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json({ deleted: true });
});

const verifyAddUser = async (userLogin: string, userPass: string): Promise<boolean> => {
    if (typeof userLogin !== 'string' || userLogin.length < 1 || typeof userPass !== 'string' || userPass.length < 1) {
        return false;
    }

    const user = await getUserByOnlyLogin(userLogin);
    if (user) {
        return false;
    }

    return true;
}

app.post('/add-user', async (req: Request, res: Response) => {
    const { userLogin, userPassword } = req.body;

    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!session?.is_admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const userAuth = await verifyAddUser(userLogin, userPassword);
    if (!userAuth) {
        res.status(400).json({ error: 'Invalid user' });
        return;
    }

    const hashed = await utils.hashPassword(userPassword);
    await addAppUser(userLogin, hashed);
    res.json({ added: true });
});

app.post('/change-user-password', async (req: Request, res: Response) => {
    const { userLogin, userPassword } = req.body;

    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!session?.is_admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (typeof userLogin !== 'string' || userLogin.length < 1 || typeof userPassword !== 'string' || userPassword.length < 1) {
        res.status(400).json({ error: `Invalid user or Password` });
        return;
    }

    const user = await getUserByOnlyLogin(userLogin);
    if (!user) {
        res.status(400).json({ error: `Invalid user, doesn't exist` });
        return;
    }

    const hashed = await utils.hashPassword(userPassword);
    const isDone = await udpateUserPassphrase(userLogin, hashed);

    if (!isDone) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json({ changed: true });
});


app.post('/change-password', async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);
    if (!is_auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const user = await getUserById(session!.id);
    if (!user) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    if (typeof currentPassword !== 'string' || currentPassword.length < 1 || typeof newPassword !== 'string' || currentPassword.length < 1) {
        res.status(400).json({ error: 'Invalid password' });
        return;
    }

    const isOk = await utils.verifyPassword(currentPassword, user.passphrase);
    if (!isOk) {
        res.status(400).json({ error: 'Invalid password' });
        return;
    }

    const hashed = await utils.hashPassword(newPassword);
    const isDone = await udpateUserPassphrase(user.login, hashed);

    if (!isDone) {
        res.status(500).json({ error: 'Internal server error' });
        return;
    }

    res.json({ changed: true });
});



app.post('/daily', async (req: Request, res: Response) => {
    let { day } = req.body;
    const token = req.cookies.session;
    const [is_auth, session] = verifySession(token);

    if (!is_auth || !day) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!utils.verifyDate(day as string)) {
        res.status(400).json({ error: 'Invalid date' });
        return;
    }
    day = day as string;

    try {
        const tracks = await getDailySummary(session!.id, day);
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching daily summary:' });
        return;
    }
});


const createAdmin = async () => {
    const user = await getUserByOnlyLogin(APP_USER_ADMIN);
    if (user) {
        return
    }

    const hashed = await utils.hashPassword(APP_USER_PASSPHRASE);
    const id = await addAppUser(APP_USER_ADMIN, hashed, true);
    if (!id) {
        console.error('Failed to create admin');
    }
}

const main = async () => {
    try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        await createTables();
        await createAdmin();
        app.listen(PORT, () => {
            console.log(`Server is running on ${PORT}`);
        });
    } catch (err) {
        console.error('Error starting the server:', err);
    }
};

main();
