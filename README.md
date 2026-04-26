# Footstat

Footstat is a football companion app with:
- a React/Vite frontend (`football-stats`) for live matches, results by date, table, and profile views;
- a Flask backend for user/profile and cached football data endpoints;
- PostgreSQL-based cache tables for competitions, fixtures, and standings.

## Features

- Live Premier League matches.
- Results by date for the entire league.
- League table with team crests and compact stats.
- Favorite team in profile with quick match overview.
- Rate-limit-aware behavior with local fallback cache in the UI.

## Tech Stack

- Frontend: React, Vite, React Router, Framer Motion, Axios
- Backend: Flask, Psycopg2
- Database: PostgreSQL
- Deployment: GitHub Pages (frontend static build)

## Project Structure

- `football-stats/` — frontend app
- `app.py` — Flask API
- `cash.py` — data loading/cache helpers
- `schema.sql` — DB schema

## Local Setup

### 1) Backend

Requirements:
- Python 3.11+
- PostgreSQL

Steps:
1. Create and activate virtualenv.
2. Install Python dependencies you use in your environment (`flask`, `psycopg2-binary`, `flask-cors`, etc.).
3. Create DB and apply `schema.sql`.
4. Update DB credentials in `app.py`/`cash.py` (`DB_CONFIG`).
5. Run backend:

```bash
python app.py
```

Default backend URL in this project is `http://127.0.0.1:5001`.

### 2) Frontend

```bash
cd football-stats
npm ci
npm run dev
```

## Frontend Environment Variables

`football-stats/src/services/api.js` uses these variables:

- `VITE_FOOTBALL_DATA_API_BASE_URL` (default `/api`)
- `VITE_PREMIER_LEAGUE_API_BASE_URL` (default `http://127.0.0.1:5000`)
- `VITE_FOOTBALL_DATA_API_KEY` (for football-data.org requests)

For local development, Vite proxy in `vite.config.js` maps `/api` to football-data.org.

## Build

```bash
cd football-stats
npm run build
```

## GitHub Pages Deployment

This repository includes workflow:
- `.github/workflows/deploy-pages.yml`

What it does:
1. Builds `football-stats`.
2. Publishes `football-stats/dist` to GitHub Pages.

### Enable Pages

In GitHub repository settings:
1. Open **Settings → Pages**.
2. Set **Build and deployment** source to **GitHub Actions**.

After pushing to `main`, Pages will deploy automatically.

Expected URL:
- `https://koolesoo.github.io/edik/`

## Notes

- If external API rate limits occur (429), UI falls back to cached data where available.
- Backend/API keys in this project are for local/private use; do not commit secrets to public repos.
