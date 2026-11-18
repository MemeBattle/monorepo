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

| Service                   | Address                        |
| ------------------------- | ------------------------------ |
| CAS, API and sign-in      | `http://localhost:3000`        |
| Postgres                  | `localhost:5433`               |
| ligretto-core-backend     | `http://localhost:3333`        |
| ligretto-gameplay-backend | `ws://localhost:3005/gameplay` |
| ligretto-frontend         | `http://localhost:5174`        |

After a change in CAS or its frontend, rebuild the image:

```
docker compose --env-file .env.development -f apps/cas/docker-compose.yml --profile image up -d --wait --build cas
```

`ligretto-core-pg` runs Postgres 18, which refuses a `pg-ligretto` volume made by an older image. `docker compose down -v`
drops it, and the local Ligretto data with it.

### Without Docker

The same services run natively; CAS then needs the Rust toolchain.

1. Postgres: any reachable server, with a database for CAS and one for the core backend. CAS takes `DATABASE_URL`
   from its environment or the root `.env` files (default `postgres://cas:cas@localhost:5434/cas`); the core backend reads its own from
   `apps/ligretto-core-backend/.env.development`, overridden in that package's `.env.development.local`. Both read
   the same variable name, so the core backend's never goes in a root `.env` file.
2. CAS, from `apps/cas`: `cargo run --bin cas-migrate`, then `scripts/seed-dev.sh` to register the `ligretto`
   client, then `bacon run` (or `cargo run`) for the server on `:3000`. Without the image it serves no sign-in pages:
   run `pnpm start:dev` in `apps/cas-frontend`, which serves them on `:5173` and proxies `/api` and `/oidc` to CAS,
   and set `CAS_URL=http://localhost:5173` in `.env.development.local` so the frontend's account link reaches them.
3. `pnpm ligretto:core-backend:migrate`, then `pnpm ligretto:apps:start:dev` for the core backend, the gameplay
   backend and the frontend.

### On a host other than localhost

The development values assume `localhost`. On another host (a tunnel, a LAN address):

- Each Vite dev server answers only the hosts in its `server.allowedHosts`: add the exact host to ligretto-frontend's,
  and to cas-frontend's when it serves the sign-in pages.
- Sign-in needs https and one site. The core backend's cookies are `__Host-` and so `Secure`, and its `cookie`
  session transport assumes the frontend and the core backend are on the same site
  (`packages/ligretto-auth/src/transport.ts`); passkeys need a secure context too.
- The browser calls the backends at `LIGRETTO_CORE_URL` and `LIGRETTO_GAMEPLAY_URL`, and the core backend accepts
  credentialed requests only from the origins in `LIGRETTO_CORE_CORS_ORIGINS`.
- CAS matches the `ligretto` client's `LIGRETTO_CORE_AUTH_REDIRECT_URI` and `LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI`
  byte for byte and cannot update a client. After changing them, reset the CAS development database
  (`docker compose -f apps/cas/docker-compose.yml down -v` drops it, with every local account) and set it up again: `pnpm ligretto:start` migrates and seeds it, or the
  native steps above.
  `LIGRETTO_CORE_AUTH_APP_URL` is where the callback sends the browser back.
- A CAS on another host needs its own `CAS_ISSUER`, `CAS_ORIGIN`, `CAS_RP_ID` and `CAS_CORS_ORIGINS`
  (`apps/cas/README.md`).

Overrides go in `.env.development.local`; restart what reads them.

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
LIGRETTO_GAMEPLAY_URL=wss://ligretto.app/gameplay
```

3. Run frontend locally

```
pnpm ligretto:front:start:dev
```

## Production

Two Cloudflare Workers share `ligretto.app` through Workers Routes: `ligretto-frontend` serves the SPA on
`ligretto.app/*`, and `ligretto-core-backend` serves `/api*`, `/health*` and `/openapi.json*` there and its internal app on
`core-internal.ligretto.app`. A third, `ligretto-gameplay-backend`, serves the game sockets on `ligretto.app/gameplay/*`.
The API and the game sockets also have routes on `tg.ligretto.app`, reserved for the Telegram Mini App, so that each
frontend calls them on its own origin; every public route answers on both hosts, not gated per host. That host has no DNS
record yet, so its routes answer nothing.
`.github/workflows/ligretto-release.yml` releases all three behind one approval. `apps/ligretto-core-backend/README.md`
and `apps/ligretto-gameplay-backend/README.md` hold the operational notes.
