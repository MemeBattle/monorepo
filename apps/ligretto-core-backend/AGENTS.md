# ligretto-core-backend

AdonisJS HTTP backend (package `@memebattle/ligretto-core-backend`). Imports inside the app use subpath imports `#…` (see `imports` in package.json).

## How to test (for agents too)

All commands run from `apps/ligretto-core-backend`:

- `pnpm ts-check` — type checking (tsc).
- `pnpm test` / `pnpm test:ci` — the Japa suites (`node ace test`). Both run `test:setup` first, which does two
  things the suites cannot do for themselves:
  - builds `@memebattle/ligretto-auth`. Under plain `node` that package resolves to its `build/`, which `pnpm install` does not produce.
  - **requires Docker**, and brings up the `ligretto-core-pg-test` compose service — the `store` suite talks to a real Postgres. Without a running daemon `test:setup` fails with `Cannot connect to the Docker daemon`.
- `node ace test --suites unit` (or `functional`) — the suites that run on in-memory sqlite, so no Docker and no
  Postgres.

### The store suite's Postgres

`store` (`app/stores/**/*.test.ts`, `database/tests/**/*.test.ts`) covers the session store, whose lock is a real
`SELECT … FOR UPDATE`; sqlite cannot stand in for it. The service is `ligretto-core-pg-test` in the root
`docker-compose.yml`: `postgres:13.4` (the version CI's e2e job runs — the oldest engine in play), host port
**5435**, database `ligretto-core-test`, data on tmpfs so every container starts from an empty cluster. Separate
from the dev `ligretto-core-pg` (5433) on purpose: a test run truncates its tables, and must never be able to
truncate the database used for development.

The container is **left running** after a run, so repeated runs do not pay for a cold start. Take it down with
`docker compose -f ../../docker-compose.yml rm -sf ligretto-core-pg-test`; because its data is on tmpfs, that is
also how you get a clean cluster. Only one run can hold port 5435, so two worktrees cannot run the `store` suite
at the same time.

## The sweep

`node ace auth:sweep` removes expired authorization requests and sessions past the cookie grace window — the
scheduled half of the session store, which `chart/templates/sweep-cronjob.yaml` runs hourly. It needs
`@memebattle/ligretto-auth` built (the retention window is that package's constant), so run
`pnpm --filter @memebattle/ligretto-auth build` first — the build `test:setup` already does.

There is no source-mode alternative under `node ace`, and `--conditions=development` is not one: the condition
resolves the package to `src/`, whose re-exports carry no file extension (`from './verify-access-token'`), and
`node ace` leaves resolution to Node's ESM resolver, which requires the extension. The sweep then dies with
`ERR_MODULE_NOT_FOUND` before it starts. `apps/ligretto-gameplay-backend` can use the condition only because
`tsx` — a bundling resolver, which fills the extension in — runs it there.

## Migrations

Lucid's runner imports **every** script file under `database/migrations/` and requires a default migration export
from each, so only migration classes may live there — a test over a migration goes in `database/tests/`
(`database/tests/usersAccountType.test.ts`), which the `store` suite already covers.
