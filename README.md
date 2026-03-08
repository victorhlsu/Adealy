## Starting the Stack

From the root directory, run:

```bash
docker-compose up
```

## Running Frontend Without Docker

If you want to run the Vite frontend directly (without `docker-compose`), run:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Vite will print the exact URL/port to open. If `5173` is already in use, it will automatically pick the next available port (e.g. `5174`).

## Stopping the Stack

### Option 1: Stop and Remove Containers (Recommended)
```bash
docker-compose down
```
This stops all services and removes containers, freeing up resources.

## Services

Once the stack is running, access:

- **Backend API**: `http://localhost:3001`
- **Main Frontend**: `http://localhost:5173`
- **API Tester**: `http://localhost:3000`

The stack includes three services running simultaneously:

| Service | Port | Purpose |
|---------|------|---------|
| **Backend** | 3001 | Express API server |
| **Frontend** | 5173 | Main Vite application (dev server) |
| **Temp Frontend** | 3000 | API Tester utility (static site) |

All services are connected on the same Docker network (`adealy-network`) for internal communication.


## Environment Variables

Backend requires a `.env` file with:
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
GOOGLE_API_KEY=your_google_api_key
