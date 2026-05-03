# CollabWrite

A collaborative markdown editor with realtime synchronization using Yjs, Socket.IO, Redis caching, and PostgreSQL for durable storage.

## Environment Setup

### Server
Copy `server/.env.example` to `server/.env` and configure:
- `DATABASE_URL` or `SUPABASE_DB_URL` for Supabase Postgres
- `REDIS_URL` for Redis (optional, local dev supported)
- `JWT_SECRET` for auth token signing
- `CLIENT_ORIGIN` for CORS whitelist

> If your database password contains `@`, `:`, or other URL-reserved characters, URL-encode them in the connection string (for example `@` becomes `%40`).

### Client
Copy `client/.env.example` to `client/.env` and configure:
- `VITE_API_BASE_URL` to point to the backend API host
- `VITE_SOCKET_URL` to point to the backend socket host (can be the same as API)

## Docker Compose Local Dev

This repository now includes a full local development compose stack for Redis, Postgres, server, and client.

1. Build and start everything:

   ```bash
docker compose up --build
```

2. Open the app at:

   - Frontend: `http://localhost:4173`
   - Backend API: `http://localhost:3001`

3. Local compose uses these defaults:

   - `DATABASE_URL=postgresql://user:password@postgres:5432/collab_editor`
   - `REDIS_URL=redis://redis:6379`
   - `VITE_API_BASE_URL=http://localhost:3001`
   - `VITE_SOCKET_URL=http://localhost:3001`

If you want to run only the database services, keep using `docker-compose.yml` as a local Postgres/Redis provider and point `server/.env` at `localhost:5432` / `localhost:6379`.

## Improvements included

- Replaced hard-coded backend URLs in frontend components with Vite environment variables
- Added centralized client API helper and socket URL resolver
- Added root `.gitignore` to protect secret files and ignore build artifacts
- Updated `server/.env.example` with safe placeholder values
- Added strong defaults for Supabase SSL and Redis fallback handling
