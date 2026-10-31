# Ligretto

## Start all

You need Docker with Compose and Node; no Rust toolchain.

```
pnpm ligretto:start
```

It starts Postgres and a local CAS with `docker compose --profile cas`, waits until both are healthy, applies the
ligretto-core-backend migrations, and starts the core backend, the gameplay backend and the frontend. The first run
builds the CAS image from the working tree, which takes a few minutes.

| Service                   | Address                 |
| ------------------------- | ----------------------- |
| CAS, API and sign-in      | `http://localhost:3000` |
| Postgres                  | `localhost:5433`        |
| ligretto-core-backend     | `http://localhost:3333` |
| ligretto-gameplay-backend | `localhost:3005`        |
| ligretto-frontend         | `http://localhost:5174` |

After a change in CAS or its frontend, rebuild the image:

```
docker compose --profile cas build cas
```

### A database volume from before the local CAS

The `pg-ligretto` volume is created with Postgres 18 and holds a second database, `cas`, which an init script creates
on an empty volume alone. A volume from before that holds an older major or the old layout, Postgres 18 refuses it, and
the fix drops the local Ligretto data:

```
docker compose down -v
```

A volume already on Postgres 18 without the `cas` database needs the SQL once:

```
docker compose exec -T ligretto-core-pg psql -U ligretto-core-user -d ligretto-core < .docker/ligretto-core-pg-cas.sql
```

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

## Production

Two Cloudflare Workers share `ligretto.app` through Workers Routes: `ligretto-frontend` serves the SPA on
`ligretto.app/*`, and `ligretto-core-backend` serves `/api*`, `/health*` and `/openapi.json*` there and its internal app on
`core-internal.ligretto.app`. `.github/workflows/ligretto-release.yml` releases both behind one approval.
`apps/ligretto-core-backend/README.md` holds the operational notes.
