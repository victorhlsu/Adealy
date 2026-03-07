# Adealy API Tester (temp)

A tiny static frontend to quickly hit the backend routes.

## Backend endpoints wired

- `GET /api/status`
- `GET /api/gemini`
- `POST /api/visa-single` with JSON body: `{ "country": "France" }`

## Run

1) Start backend (default port is `3001`).

2) Serve this folder with any static server (recommended vs opening `index.html` as `file://`).

### Option A: Node (no install)

From this folder:

```bash
npx http-server -p 5178
```

Open: `http://localhost:5178`

### Option B: Python

```bash
python -m http.server 5178
```

Open: `http://localhost:5178`

## Notes

- Base URL defaults to `http://localhost:3001/api`.
- Base URL is saved in `localStorage`.
- Your backend enables CORS via `app.use(cors())`, so cross-origin fetch from this page should work.
