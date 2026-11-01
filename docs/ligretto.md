# Ligretto

## Start all

You need Docker with Compose and Node; no Rust toolchain.

```
pnpm ligretto:start
```

It starts Ligretto's Postgres from the root `docker-compose.yml` and a local CAS from `apps/cas/docker-compose.yml`
(its own Postgres, migrations and the `ligretto` client, then the server), applies the ligretto-core-backend
migrations, and starts the core backend, the gameplay backend and the frontend. The first run builds the CAS image
from the working tree, which takes a few minutes.

| Service                   | Address                 |
| ------------------------- | ----------------------- |
| CAS, API and sign-in      | `http://localhost:3000` |
| Postgres                  | `localhost:5433`        |
| ligretto-core-backend     | `http://localhost:3333` |
| ligretto-gameplay-backend | `localhost:3005`        |
| ligretto-frontend         | `http://localhost:5174` |

After a change in CAS or its frontend, rebuild the image:

```
docker compose --env-file .env.development -f apps/cas/docker-compose.yml --profile image up -d --wait --build cas
```

`ligretto-core-pg` runs Postgres 18, which refuses a `pg-ligretto` volume made by an older image. `docker compose down -v`
drops it, and the local Ligretto data with it.

### Against the production CAS

Set the three variables in `.env.development.local`, with a client registered in that CAS. The frontend's `CAS_URL`
follows `CAS_ISSUER`:

```
CAS_ISSUER=https://cas.mems.fun
LIGRETTO_CAS_CLIENT_ID=<client id>
LIGRETTO_CAS_CLIENT_SECRET=<client secret>
```

## Start Ligretto frontend only

The frontend needs a local core backend: production allows no CORS origin, so `LIGRETTO_CORE_URL` keeps its
`.env.development` default.

1. Create `.env.development.local` in the root directory
2. Set this variable:

```
LIGRETTO_GAMEPLAY_URL=https://api.ligretto.app
```

3. Run frontend locally

```
pnpm ligretto:front:start:dev
```

## Gameplay transport

`apps/ligretto-gameplay-backend` gets its Socket.IO connections from an engine chosen at setup: the standard engine on
Node, a WebSocket-only one for Durable Objects. [socket-engine.md](../apps/ligretto-gameplay-backend/docs/socket-engine.md)
describes both, the limitations of the second and the transport contract suite.

## Production

Two Cloudflare Workers share `ligretto.app` through Workers Routes: `ligretto-frontend` serves the SPA on
`ligretto.app/*`, and `ligretto-core-backend` serves `/api*`, `/health*` and `/openapi.json*` there and its internal app on
`core-internal.ligretto.app`. `.github/workflows/ligretto-release.yml` releases both behind one approval.
`apps/ligretto-core-backend/README.md` holds the operational notes.
