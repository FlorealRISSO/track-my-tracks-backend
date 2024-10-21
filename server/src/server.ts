import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import querystring from 'querystring';
import * as dotenv from 'dotenv';
import * as utils from './utils';
import { addAppUser, deleteAppUser, getAllUsers, getTracksListenedOnDate, getUserByKey, getUserByLogin, getUserByOnlyLogin, udpateUserKey, updateUserToken } from './db';
import getDailySummary from './daily';

dotenv.config();
const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SCOPE = 'user-read-recently-played';
const PORT = 3000;

console.log('ORIGIN:', FRONTEND_URL);

const REQUESTS = new Map<string, string>();

app.use(cors({ origin: FRONTEND_URL}));
app.use(express.json());

enum AuthState {
    NEEDS_AUTH,
    AUTHENTICATED,
    READY,
    INVALID,
}

const verifyLogin = async (login: string, passphrase: string): Promise<AuthState | string> => {
    if (typeof passphrase !== 'string' || passphrase.length < 1) {
        return AuthState.INVALID;
    }

    if (typeof login !== 'string' || login.length < 1) {
        return AuthState.INVALID;
    }

    const filteredPass = utils.filterNonAlphanumeric(passphrase);
    if (filteredPass !== passphrase) {
        return AuthState.INVALID;
    }

    const filteredLogin = utils.filterNonAlphanumeric(login);
    if (filteredLogin !== login) {
        return AuthState.INVALID
    }

    const user = await getUserByLogin(login, passphrase);
    if (!user) {
        return AuthState.INVALID;
    }

    if (!user.token) {
        return AuthState.NEEDS_AUTH;
    }

    const isTokenValid = await verifyToken(user.token);
    if (!isTokenValid) {
        return AuthState.NEEDS_AUTH;
    }

    if (user.key) {
        return user.key;
    }

    return AuthState.AUTHENTICATED;
};

const verifyAdmin = async (login: string, passphrase: string): Promise<boolean> => {
    if (typeof passphrase !== 'string' || passphrase.length < 1 || typeof login !== 'string' || login.length < 1) {
        return false
    }

    const filteredPass = utils.filterNonAlphanumeric(passphrase);
    const filteredLogin = utils.filterNonAlphanumeric(login);
    if (filteredPass !== passphrase || filteredLogin !== login) {
        return false;
    }

    const user = await getUserByLogin(login, passphrase);
    if (!user || !user.isadmin) {
        return false;
    }


    return true;
}

const verifyUser = async (login: string): Promise<boolean> => {
    if (typeof login !== 'string' || login.length < 1) {
        return false;
    }

    const filteredLogin = utils.filterNonAlphanumeric(login);
    if (filteredLogin !== login) {
        return false;
    }

    const user = await getUserByOnlyLogin(login);
    if (!user || user.isadmin) {
        return false;
    }

    return true;
}


const verifyToken = async (token: string): Promise<boolean> => {
    try {
        const response = await fetch(`${SPOTIFY_API_URL}/me`, {
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

enum KeyState {
    VALID,
    INVALID,
    MISSING,
}

const verifyKey = async (key: string): Promise<KeyState> => {
    if (!key || typeof key !== 'string') {
        return KeyState.MISSING;
    }

    const filteredKey = utils.filterNonAlphanumeric(key);
    if (filteredKey !== key) {
        return KeyState.INVALID;
    }

    const user = await getUserByKey(key);
    if (!user) {
        return KeyState.INVALID;
    }

    return KeyState.VALID;
}

const authenticateSpotify = async (req: Request, res: Response, login: string) => {
    const state = utils.generateRandomString(16);
    const queryParams = querystring.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI,
        state: state,
    });

    REQUESTS.set(state, login);
    res.json({ redirect_uri: `${SPOTIFY_AUTH_URL}?${queryParams}` });
};

app.post('/login', async (req: Request, res: Response) => {
    const { login, passphrase } = req.body;

    if (!login || !passphrase) {
        res.json({ authenticated: false });
        return;
    }

    const auth = await verifyLogin(login, passphrase);
    if (typeof auth === 'string') {
        res.json({ authenticated: true, key: auth });
    }

    switch (auth) {
        case AuthState.AUTHENTICATED:
            const key = utils.generateRandomKey(login, 64);
            udpateUserKey(login, key);
            res.json({ authenticated: true, key: key });
            return;
        case AuthState.NEEDS_AUTH:
            await authenticateSpotify(req, res, login);
            return;
        case AuthState.INVALID:
            res.json({ authenticated: false, error: 'Invalid login or passphrase' });
            return;
    }
});

app.post('/verify', async (req: Request, res: Response) => {
    const { key } = req.body;

    const auth = await verifyKey(key);
    switch (auth) {
        case KeyState.VALID:
            res.status(200).json({ authenticated: true });
            return;
        case KeyState.INVALID:
            res.status(401).json({ error: 'Invalid key' });
            return;
        case KeyState.MISSING:
            res.status(400).json({ error: 'Missing key' });
            return;
    }
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
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to retrieve token');
        }

        const tokenData = await tokenResponse.json();
        const { refresh_token, access_token } = tokenData;

        const userKey = utils.generateRandomKey(login, 64);
        await updateUserToken(login, access_token, refresh_token);
        await udpateUserKey(login, userKey);

        res.redirect(`${FRONTEND_URL}?key=${userKey}`);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/users', async (req: Request, res: Response) => {
    const { login, password } = req.body;
    console.log('Getting all users');

    if (!login || !password) {
        res.status(400).json({ error: 'Missing login or password' });
        return;
    }

    const auth = await verifyAdmin(login, password);
    if (!auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    // get all users login 
    const users = await getAllUsers();
    res.json(users);
});

app.post('/delete-user', async (req: Request, res: Response) => {
    const { login, password, userLogin } = req.body;
    console.log(`Deleting user: ${userLogin}`);

    if (!login || !password) {
        res.json({ authenticated: false });
        return;
    }
    const auth = await verifyAdmin(login, password);

    if (!auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const userAuth = await verifyUser(userLogin);
    if (!userAuth) {
        res.status(400).json({ error: 'Invalid user' });
        return;
    }

    // delete user
    await deleteAppUser(userLogin);
    res.json({ deleted: true });
});

const verifyAddUser = async (userLogin: string, userPass: string): Promise<boolean> => {
    if (typeof userLogin !== 'string' || userLogin.length < 1 || typeof userPass !== 'string' || userPass.length < 1) {
        return false;
    }

    const filteredLogin = utils.filterNonAlphanumeric(userLogin);
    const filteredPass = utils.filterNonAlphanumeric(userPass);
    if (filteredLogin !== userLogin || filteredPass !== userPass) {
        return false;
    }

    const user = await getUserByOnlyLogin(userLogin);
    if (user) {
        return false;
    }

    return true;
}

app.post('/add-user', async (req: Request, res: Response) => {
    const { login, password, userLogin, userPassword} = req.body;
    console.log(`Adding user: ${userLogin}`);

    if (!login || !password) {
        res.json({ authenticated: false });
        return;
    }

    const auth = await verifyAdmin(login, password);
    if (!auth) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const userAuth = await verifyAddUser(userLogin, userPassword);
    if (!userAuth) {
        res.status(400).json({ error: 'Invalid user' });
        return;
    }
    await addAppUser(userLogin, userPassword);
    res.json({ added: true });
});



const verifyDate = async (date: string) => {
    // format yyyy-mm-dd
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!date.match(dateRegex)) {
        return false;
    }
    return true;
}

app.post('/daily', async (req: Request, res: Response) => {
    const { key, day } = req.body;
    console.log(`Daily update for ${day}`);

    if (!key || !day) {
        console.log('Missing passphrase or day');
        res.status(400).json({ error: 'Missing passphrase or day' });
        return;
    }

    const auth = await verifyKey(key as string);
    if (auth !== KeyState.VALID) {
        console.log(`Unauthorized: ${auth}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!verifyDate(day as string)) {
        console.log('Invalid date');
        res.status(400).json({ error: 'Invalid date' });
        return;
    }

    const tracks = await getDailySummary(key as string, day as string);
    res.json(tracks);
});

const main = async () => {
    try {
        app.listen(PORT, () => {
            console.log(`Server is running on ${PORT}`);
        });
    } catch (err) {
        console.error('Error starting the server:', err);
    }
};

main();
