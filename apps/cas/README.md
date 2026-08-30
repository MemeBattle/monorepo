# CAS

CAS (Central Authentication Service) is a centralized authentication and user management service for an ecosystem of applications. It serves as a single Identity Provider (IdP) that allows multiple applications to delegate user authentication and identity management, eliminating the need for each application to implement its own authentication system.

## Configuration

Configuration is read from environment variables at startup. Every variable has a dev-friendly default, so `bacon run` works with no environment set. An invalid value fails startup with an error.

| Variable           | Default                 | Description                                   |
| ------------------ | ----------------------- | --------------------------------------------- |
| `CAS_PORT`         | `3000`                  | TCP port the server listens on.               |
| `CAS_RP_ID`        | `localhost`             | WebAuthn relying party ID.                    |
| `CAS_ORIGIN`       | `http://localhost:5173` | WebAuthn relying party origin URL.            |
| `CAS_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. |
| `DATABASE_URL`     | `postgres://cas:cas@localhost:5434/cas` | Postgres connection URL. The default matches `docker-compose.yml`. |

At startup the service also loads the monorepo root `.env` files. `APP_ENV` selects the environment and defaults to `development`; missing files are skipped. Priority, highest first:

1. the real process environment
2. `.env.{APP_ENV}.local`
3. `.env.{APP_ENV}`
4. `.env.local`
5. `.env`

## Database (local dev)

Postgres runs in Docker; `docker-compose.yml` in this directory provides it with dev-only credentials (user/password/db `cas`) on host port `5434`:

```
docker compose -f apps/cas/docker-compose.yml up -d
```

The connection pool is lazy: the server starts even when the DB is down. `GET /health` runs `SELECT 1` and returns `200` when the DB answers, `503` otherwise.

## Prepare bacon (used for dev server reload)

```
cargo install --locked bacon
```

```
bacon run
```
