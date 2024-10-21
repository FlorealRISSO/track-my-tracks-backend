import psycopg2
import requests
import time
import base64
import os
from dotenv import load_dotenv

load_dotenv()

# Define connection parameters
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# Admin
APP_USER_ADMIN = os.getenv("APP_USER_ADMIN")
APP_USER_PASSPHRASE = os.getenv("APP_USER_PASSPHRASE")

# Client ID and Secret
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

# Spotify API URLs and Auth options
SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
SPOTIFY_RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=50'

# SQL commands to create the required tables
create_tables_query = """
CREATE TABLE IF NOT EXISTS AppUser (
    id SERIAL PRIMARY KEY,
    isAdmin BOOLEAN DEFAULT FALSE,
    login VARCHAR(255) NOT NULL UNIQUE,
    passphrase VARCHAR(255) NOT NULL,
    key VARCHAR(255) UNIQUE,
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
"""

drop_tables_query = """
DROP TABLE IF EXISTS RelationListenTrack CASCADE;
DROP TABLE IF EXISTS AppUser CASCADE;
"""

get_users_query = "SELECT id, token, refreshToken FROM AppUser;"

class ListenTrack:
    def __init__(self, user_id, track_id, timestamp):
        self.user_id = user_id
        self.track_id = track_id
        self.timestamp = timestamp

def fetch_recently_played(access_token) -> dict:
    headers = {'Authorization': f'Bearer {access_token}'}
    print(f"Fetching recently played tracks with token: {access_token}")
    response = requests.get(SPOTIFY_RECENTLY_PLAYED_URL, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        return data
    else:
        print(f"Error fetching recently played tracks: {response.status_code}")
        return None

def fetch_new_access_token(refresh_token):
    client = f'{CLIENT_ID}:{CLIENT_SECRET}'
    b64_client = base64.b64encode(client.encode()).decode()
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': f'Basic {b64_client}',
    }
    data = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
    }

    response = requests.post(SPOTIFY_TOKEN_URL, headers=headers, data=data)
    if response.status_code == 200:
        response_json = response.json()
        refresh_token = response_json.get('refresh_token', refresh_token)
        return response_json['access_token'], refresh_token
    else:
        print(f"Error fetching new access token: {response.status_code} - {response.text}")
        return None, None


def insert_listen(cursor, listen):
    query = """
    INSERT INTO RelationListenTrack (userId, trackId, timestamp)
    VALUES (%s, %s, %s)
    ON CONFLICT (userId, trackId, timestamp) DO NOTHING
    """
    cursor.execute(query, (listen.user_id, listen.track_id, listen.timestamp))

def simplify_object(obj):
    if isinstance(obj, dict):
        return {k: simplify_object(v) for k, v in obj.items() if v is not None and v != []}
    elif isinstance(obj, list):
        return [simplify_object(item) for item in obj if item is not None]
    else:
        return obj

def setup_db() -> bool:
    print("Setting up the database...")
    try:
        connection = psycopg2.connect(
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        cursor = connection.cursor()
        cursor.execute(create_tables_query)
        connection.commit()
        return True
    except Exception as error:
        print(f"Error: {error}")
        return False

def create_appuser_admin():
    try:
        connection = psycopg2.connect(
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        cursor = connection.cursor()
        query = "INSERT INTO AppUser (login, passphrase, isAdmin) VALUES ('%s', '%s', true) ON CONFLICT (login) DO NOTHING;" % (APP_USER_ADMIN, APP_USER_PASSPHRASE)
        cursor.execute(query)
        connection.commit()
        print("Dummy user added.")
    except Exception as error:
        print(f"Error: {error}")

def update_user_token(cursor, user_id, token, refresh_token):
    query = """
    UPDATE AppUser
    SET token = %s, refreshToken = %s
    WHERE id = %s
    """
    cursor.execute(query, (token, refresh_token, user_id))

def main():
    if not setup_db():
        print("Failed to setup the database.")
        return
    create_appuser_admin()

    while True:
        try:
            connection = psycopg2.connect(
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                host=DB_HOST,
                port=DB_PORT
            )
            cursor = connection.cursor()

            cursor.execute(get_users_query)
            users = cursor.fetchall()

            for user in users:
                user_id, user_token, user_refresh_token = user
                print(f"Processing user ID: {user_id}")

                if user_token:
                    new_token, new_refresh = fetch_new_access_token(user_refresh_token)
                    if not new_token:
                        print(f"Failed to get access token for user {user_id}.")
                        continue 
                       
                    if new_token != user_token:
                        print(f"New access token: {new_token}")
                        update_user_token(cursor, user_id, new_token, new_refresh)
                        connection.commit()
                        user_token = new_token

                    recently_played = fetch_recently_played(user_token)

                    if recently_played:
                        for item in recently_played['items']:
                            if item['track']:
                                track_id = item['track']['id']
                                listen = ListenTrack(user_id, track_id, item['played_at'])
                                # Insert listen record
                                insert_listen(cursor, listen)
                        
                        print(f"Successfully processed recently played tracks for user {user_id}.")
                    else:
                        print(f"Failed to fetch recently played tracks for user {user_id}.")
                else:
                    print(f"Failed to get access token for user {user_id}.")

            connection.commit()

        except Exception as error:
            print(f"Error: {error}")

        finally:
            if connection:
                cursor.close()
                connection.close()
                print("PostgreSQL connection is closed.")

        # Sleep for 30 minutes (1800 seconds)
        time.sleep(1800)

def main_test():
    try:
        # Connect to the database
        connection = psycopg2.connect(
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        cursor = connection.cursor()

        # Track listens for today
        print("\n--- Fetching track listens for today ---")
        cursor.execute("""
					SELECT trackId, timestamp
					FROM RelationListenTrack
					WHERE timestamp >= CURRENT_DATE
					AND timestamp < CURRENT_DATE + INTERVAL '1 day';
					""")
        today = cursor.fetchall()
        for trackId, timestamp in today:
            print(f"TrackId: ${trackId}, timestamp: ${timestamp}")

    except Exception as error:
        print(f"Error: {error}")

    finally:
        if connection:
            cursor.close()
            connection.close()
            print("\nPostgreSQL connection is closed.")

if __name__ == "__main__":
    main()
