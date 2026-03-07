# Adealy Backend

Basic Express backend with a health/ping endpoint.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run in development (with auto-reload):
   ```bash
   npm run dev
   ```
3. Run in production mode:
   ```bash
   npm start
   ```

## Endpoints

- `GET /api/ping` — returns status, uptime, timestamp, and hostname.

## Configuration

- `PORT` environment variable (defaults to `3001`).
