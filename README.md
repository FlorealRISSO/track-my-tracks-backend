# Track My Tracks - Backend

**Track My Tracks** is the backend component of a Spotify listening tracker that automatically retrieves and stores your listening history. This project allows you to analyze your Spotify usage, providing insights into total listening time, favorite genres, and top artists.

## Features

- **Automated Spotify Listening Data**: A Python worker fetches your recently played tracks from Spotify every 30 minutes and saves them to the database.
- **Track History**: Access a complete history of the songs you've listened to, along with timestamps and metadata.
- **Listening Time**: View the total time spent listening to Spotify over various periods.
- **Genre and Artist Breakdown**: Get insights into your most-listened-to genres and top artists.

## Tech Stack

- **Express.js with TypeScript**: Handles API requests, processes data, and manages communication with the database.
- **PostgreSQL**: Stores track data, listening times, and genre/artist information.
- **Python Worker**: Periodically fetches data from the Spotify API and writes it to the database.

## Getting Started

### Prerequisites

- Ensure you have Docker and Docker Compose installed on your machine.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/track-my-tracks-backend.git
   cd track-my-tracks-backend
   ```

2. **Modify `docker-compose.yml`**: Set your Spotify API **Client ID** and **Client Secret** in the environment variables section of the `docker-compose.yml` file.

3. **Run with Docker**:
   ```bash
   docker-compose up
   ```

This command will build and start the backend services, including the PostgreSQL database.

## Usage

- Once the backend is running, the Python worker will automatically retrieve your Spotify data every 30 minutes.
- You can interact with the backend API to view your track history, total listening time, and genre/artist breakdown.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
