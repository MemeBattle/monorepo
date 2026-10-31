---
title: Testing strategy
description: >-
  vitest everywhere. Use cases are tested with fakes for their ports; HTTP and repository tests drive app.request()
  against PGlite with the real migrations applied in-process and the in-memory SessionStore for the auth routes;
  everything that exercises the real session store runs against the Docker Postgres on port 5435; both runtime
  entries have a vitest smoke suite (test/node, test/worker) that CI runs as a script.
read_when:
  - writing a test and deciding which database it gets
  - adding a port and wondering what fake it needs
  - changing the CI jobs of this package
  - a test needs Docker, or must not
---

# Testing strategy

## Context

The previous suites ran on Japa with in-memory SQLite for everything but the store, which forced an SQLite dialect
onto Postgres code and left the store as the only suite that needed Docker. The rest of the monorepo is on vitest.
Two things are required of the new suites: a developer runs most of them with nothing installed but Node, and the
tests exercise real Postgres SQL, not a stand-in dialect. One constraint shapes the split: the session store needs
two independent connections for a single request (`session-store-locking.md`), and PGlite provides one.

## Decision

- **vitest** for every suite; Japa is gone. Suites are selected by path, not by a runner configuration.
- **Use cases**: unit tests with in-memory fakes of the ports (`GamesRepository`, `UsersRepository`, `Clock`,
  `Logger`). No database, no HTTP. The fakes live next to the port they fake in `src/core`.
- **Repositories and HTTP**: tests create the app with the real Postgres repositories over **PGlite** (Postgres
  compiled to WebAssembly, in-process, Kysely's built-in `PGliteDialect`), apply the real migrations through
  Kysely's `Migrator` in `beforeAll`, and call `app.request()`. No Docker, no network, a fresh database per file.
  For the auth routes these tests use `createInMemorySessionStore` from `ligretto-auth` and a scripted CAS client:
  what they test is the mounting, the cookies and the error mapping, not the store. The contract tests in
  `packages/ligretto-core-client` drive the generated client against the same `app.request()` through a custom
  `fetch`.
- **The real session store**: every test that touches `PgSessionStore` or the sweep — CRUD, upserts, take-once,
  the lock, the two-connection arrangement, the sweep's lock handling — runs against the Docker Postgres
  (`ligretto-core-pg-test`, host port 5435, the same container and rules as before: one run at a time per host).
  They are a separate vitest project (`pnpm test:store`) so `pnpm test` without Docker still passes everything else.
- **Entries**: each runtime entry has a vitest smoke suite. `pnpm test:node` (`test/node`) boots `entry/node.ts` as
  a child process on a free port with the development `.env` files and asserts over `fetch`; `pnpm test:worker`
  (`test/worker`) runs the Worker under `workerd` (`@cloudflare/vitest-plugin`, reading `cloudflare.config.ts`),
  with Hyperdrive connection strings pointing at the job's Postgres. `pnpm test:node` needs only the Postgres its
  `/health` probes. `pnpm test:worker` needs that Postgres migrated, because the cron handler reads the tables. Both
  stay out of `pnpm test`. CI workflows run these scripts and never assert over HTTP themselves: a new route's smoke
  check is a spec, not a workflow step. These are smoke tests of the wiring, not of behaviour.
- **Product e2e**: the only job of `ligretto-pr.yml`. It runs this package from `start:dev` on the job's Postgres, the
  gameplay backend, the frontend on `:5174` and Playwright, against the production CAS through the confidential client
  `ligretto-ci`; nothing of CAS is built in CI. A package's own checks run in that package's workflow, triggered by the
  package and the workspace packages it depends on, so a change confined to the frontend does not run this package's
  suites. The cost is a dependency on the production CAS being up and guest accounts left there until CAS has a guest GC.
- **Fixtures**: a seed helper inserts users through the same repository the service uses, never raw rows, so a
  schema change breaks the helper in one place.

## Consequences

- `pnpm test` is fast and needs nothing; `pnpm test:store` needs Docker and says so when it is missing.
- A query that works on PGlite and fails on the Postgres the service runs against (Neon) or the one CI pins is
  possible in theory; the store suite and the e2e job run on a real engine and are the backstop. CI pins the
  oldest engine in play, so SQL stays within what it supports.
- A new port comes with its fake, or its first consumer's test cannot be written.
- The PGlite and Kysely versions are pinned in the catalog like everything else; the dialect ships with Kysely, so
  there is no third package to keep in step.

upd (2026-10-24): the Workers vitest integration is now @cloudflare/vitest-plugin (the pool package is deprecated and
does not load under vitest 5); the Worker smoke suite reads cloudflare.config.ts through the plugin.

upd (2026-10-24): HTTP suites that compose the real adapters over PGlite live in test/http, because the lint boundary
of src/http forbids importing src/adapters and grants tests no exception; HTTP suites on fakes stay beside the code.

upd (2026-10-25): the Node entry's smoke checks moved from curl steps in the workflow to the vitest project test/node;
workflows run scripts and never assert over HTTP.

upd (2026-10-25): the contract tests of packages/ligretto-core-client compose both apps through this package's
`./contract-harness` export (test/support/contract-harness.ts), which keeps one PGlite database and rebuilds every
other part per case ([#839](https://github.com/MemeBattle/monorepo/issues/839)).

upd (2026-10-30): `pnpm test:worker` needs a migrated database, because the cron handler reads the tables and its spec
seeds a session through the session store. `pnpm migrate` follows the package's env files and the Worker suite follows
`dev.connectionString` in cloudflare.config.ts, so the two can name different databases: check both after overriding one.

upd (2026-10-30): `pnpm test:worker` also needs the Build Output of `pnpm build:worker`, because the SPA specs read its
assets and `vitest.worker.config.ts` declares the assets binding on them
([#865](https://github.com/MemeBattle/monorepo/issues/865)).

upd (2026-10-31): the SPA is its own Worker, so `pnpm test:worker` needs no Build Output and the host invariant of the
internal hostname is checked at activation; `ligretto-pr.yml` keeps only the product e2e, against the production CAS
([#870](https://github.com/MemeBattle/monorepo/issues/870)).
