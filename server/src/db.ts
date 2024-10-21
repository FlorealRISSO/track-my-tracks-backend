import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();
const DATABASE_URL = process.env.DB_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
});

export const query = async (text: string, params?: any[]) => {
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } catch (err) {
        console.error('Database query error:', err);
        throw err;
    } finally {
        client.release();
    }
};

async function getUsers() {
    try {
        const res = await query('SELECT * FROM AppUser');
    } catch (err) {
        console.error(err);
    }
}

export const getUserByKey = async (key: string) => {
    try {
        const res = await query(
            'SELECT * FROM AppUser WHERE key = $1',
            [key]
        );
        return res.rows[0];
    } catch (err) {
        console.error('Error fetching user by key:', err);
        throw err;
    }
};

export const getUserByLogin = async (login: string, passphrase: string) => {
    try {
        const res = await query(
            'SELECT * FROM AppUser WHERE login = $1 AND passphrase = $2',
            [login, passphrase]
        );
        return res.rows[0];
    } catch (err) {
        console.error('Error fetching user by login:', err);
        throw err;
    }
};

export const getUserByOnlyLogin = async (login: string) => {
    try {
        const res = await query(
            'SELECT * FROM AppUser WHERE login = $1',
            [login]
        );
        return res.rows[0];
    } catch (err) {
        console.error('Error fetching user by login:', err);
        throw err;
    }
};

export const updateUserToken = async (login: string, token: string, refresh_token: string) => {
    try {
        await query(
            'UPDATE AppUser SET token = $1, refreshToken = $2 WHERE login = $3',
            [token, refresh_token, login]
        );
    } catch (err) {
        console.error('Error updating user token:', err);
        throw err;
    }
};

export const udpateUserKey = async (login: string, newKey: string) => {
    try {
        await query(
            'UPDATE AppUser SET key = $1 WHERE login = $2',
            [newKey, login]
        );
    } catch (err) {
        console.error('Error updating user key:', err);
        throw err;
    }
}

export const getUserIdFromKey = async (key: string) => {
    try {
        const res = await query(
            'SELECT id FROM AppUser WHERE key = $1',
            [key]
        );
        return res.rows[0].id;
    } catch (err) {
        console.error('Error fetching user ID by key:', err);
        throw err;
    }
}

export const getAllUsers = async () => {
    try {
        const res = await query('SELECT login FROM AppUser');
        return res.rows;
    } catch (err) {
        console.error('Error fetching all users:', err);
        throw err;
    }
}

export const deleteAppUser = async (login: string) => {
    try {
        await query('DELETE FROM AppUser WHERE login = $1', [login]);
    } catch (err) {
        console.error('Error deleting user:', err);
        throw err;
    }
}

export const addAppUser = async (login: string, passphrase: string) => {
    try {
        await query('INSERT INTO AppUser (login, passphrase) VALUES ($1, $2)', [login, passphrase]);
    } catch (err) {
        console.error('Error adding user:', err);
        throw err;
    }
}

export async function getTracksListenedOnDate(userId: number, chosenDate: string): Promise<any[]> {
    const query = `
    SELECT trackId, timestamp
    FROM RelationListenTrack
    WHERE timestamp >= $1::date
      AND timestamp < $1::date + INTERVAL '1 day'
      AND userId = $2;
  `;

    try {
        const result = await pool.query(query, [chosenDate, userId]);
        return result.rows;
    } catch (error) {
        console.error('Error executing query', error);
        throw error;
    }
}
