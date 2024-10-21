import { Pool } from 'pg';
import * as dotenv from 'dotenv';

const create_tables_query = `
CREATE TABLE IF NOT EXISTS AppUser (
    id SERIAL PRIMARY KEY,
    isAdmin BOOLEAN DEFAULT FALSE,
    login VARCHAR(255) NOT NULL UNIQUE,
    passphrase VARCHAR(255) NOT NULL,
    token VARCHAR(255),
    refreshToken VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS RelationListenTrack (
    userId SERIAL NOT NULL,
    trackId VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (userId, trackId, timestamp),
    FOREIGN KEY (userId) REFERENCES AppUser(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SuperKeys (
    id SERIAL PRIMARY KEY,
    superkey VARCHAR(64) NOT NULL UNIQUE
);
`;

const drop_tables_query = `
DROP TABLE IF EXISTS SuperKeys CASCADE;
DROP TABLE IF EXISTS RelationListenTrack CASCADE;
DROP TABLE IF EXISTS AppUser CASCADE;
`;

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

export const getUserByLogin = async (login: string, passphrase: string): Promise<any | null> => {
    try {
        const res = await query(
            'SELECT * FROM AppUser WHERE login = $1 AND passphrase = $2',
            [login, passphrase]
        );
        return res.rows[0];
    } catch (err) {
        console.error('Error fetching user by login:', err);
        return null;
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

export const getUserById = async (id: string): Promise<any | null> => {
    try {
        const res = await query(
            'SELECT * FROM AppUser WHERE id = $1',
            [id]
        );
        return res.rows[0];
    } catch (err) {
        console.error('Error fetching user by ID:', err);
        return null;
    }
}

export const updateUserToken = async (login: string, token: string, refresh_token: string): Promise<boolean> => {
    try {
        await query(
            'UPDATE AppUser SET token = $1, refreshToken = $2 WHERE login = $3',
            [token, refresh_token, login]
        );
        return true;
    } catch (err) {
        console.error('Error updating user token:', err);
        return false;
    }
};

export const udpateUserPassphrase = async (login: string, passphrase: string): Promise<boolean> => {
    try {
        await query(
            'UPDATE AppUser SET passphrase = $1 WHERE login = $2',
            [passphrase, login]
        );
        return true;
    } catch (err) {
        console.error('Error updating user passphrase:', err);
        return false;
    }
}

export const getAllUsers = async (): Promise<any[] | null> => {
    try {
        const res = await query('SELECT login, isadmin FROM AppUser');
        return res.rows;
    } catch (err) {
        console.error('Error fetching all users:', err);
        return null;
    }
}

export const deleteAppUser = async (login: string): Promise<boolean> => {
    try {
        await query('DELETE FROM AppUser WHERE login = $1 AND isadmin = false', [login]);
        return true;
    } catch (err) {
        console.error('Error deleting user:', err);
        return false;
    }
}

export const addAppUser = async (login: string, passphrase: string, isAdmin = false): Promise<number | null> => {
    try {
        const res = await query('INSERT INTO AppUser (login, passphrase, isadmin) VALUES ($1, $2, $3) RETURNING id', [login, passphrase, isAdmin]);
        return res.rows[0].id;
    } catch (err) {
        console.error('Error adding user:', err);
        return null;
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

export async function verifySuperkey(superkey: string): Promise<boolean> {
    const query = `
        SELECT
            EXISTS (
                SELECT 1
                FROM superkeys
                WHERE superkey = $1
            ) AS result;
    `;
    try {
        const result = await pool.query(query, [superkey]);
        return result.rows[0].result;
    } catch (error) {
        console.error('Error executing query', error);
        return false;
    }
}

export async function getAllSuperkeys(): Promise<string[]> {
    const query = `SELECT superkey FROM SuperKeys;`;
    try {
        const result = await pool.query(query);
        return result.rows.map(row => row.superkey);
    } catch (error) {
        console.error('Error executing query', error);
        return [];
    }
}

export async function useSuperkey(superkey: string): Promise<boolean> {
    const query = `DELETE FROM SuperKeys WHERE superkey = $1;`;
    try {
        await pool.query(query, [superkey]);
        return true;
    } catch (error) {
        console.error('Error executing query', error);
        return false;
    }
}

export async function insertSuperkey(superkey: string): Promise<boolean> {
    const query = `INSERT INTO SuperKeys (superkey) VALUES ($1);`;
    try {
        await pool.query(query, [superkey]);
        return true;
    } catch (error) {
        console.error('Error executing query', error);
        return false;
    }
}

export async function createTables(): Promise<void> {
    try {
        await query(create_tables_query);
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

export async function dropTables(): Promise<void> {
    try {
        await query(drop_tables_query);
    } catch (error) {
        console.error('Error dropping tables:', error);
    }
}