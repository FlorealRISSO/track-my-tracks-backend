# Track My Tracks - Backend

The **Track My Tracks Backend** is the core server for collecting and processing Spotify listening data. It connects with the Spotify API to fetch the user's listening history, aggregates this data, and stores it in a PostgreSQL database. The backend serves this data to the frontend to display insights like listening history, top genres, and artists.

The worker script runs every 30 minutes, fetching the most recent tracks played by the user and storing them in the database.

## Docker Setup

To build and run the application with Docker, refer to the instructions in the [Track My Tracks - Main Repository](https://github.com/FlorealRISSO/track-my-tracks) for the full setup and configuration.

## Repositories

- **Main**: [Track My Tracks - Main Repository](https://github.com/FlorealRISSO/track-my-tracks)
- **Frontend**: [Track My Tracks - Frontend GitHub Repository](https://github.com/FlorealRISSO/track-my-tracks)
- **Backend**: [Track My Tracks - Backend GitHub Repository](https://github.com/FlorealRISSO/track-my-tracks-backend)

## Key Features

- **Spotify Data Integration**: Fetches real-time listening data from the Spotify API.
- **PostgreSQL Database**: Stores user listening history and insights.
- **Worker Script**: Runs every 30 minutes to retrieve the most recent played tracks and updates the database.
- **API**: Provides endpoints for the frontend to query data about listening history, total listening time, genres, artists, etc.

## Tech Stack

- **Node.js**: The backend is built using Node.js with Express for handling HTTP requests.
- **PostgreSQL**: A relational database used to store the listening history data.
- **Worker (Python)**: A Python-based worker script (`worker.py`) runs every 30 minutes to retrieve recently played tracks from the Spotify API.
- **Docker**: The backend and worker components are containerized for easy deployment and management.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
