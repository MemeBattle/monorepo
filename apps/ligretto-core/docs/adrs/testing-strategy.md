---
title: Testing strategy
description: >-
  vitest everywhere. Use cases are tested with fakes for their ports; HTTP and repository tests drive app.request()
  against PGlite with the real migrations applied in-process and the in-memory SessionStore for the auth routes;
  everything that exercises the real session store runs against the Docker Postgres on port 5435; both runtime
  entries get a smoke test in CI.
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
- **Entries**: CI boots `entry/node.ts` and `GET /health`; builds the Worker and runs the same request under
  `workerd` (`@cloudflare/vitest-plugin`, reading `cloudflare.config.ts`), with Hyperdrive connection strings
  pointing at the job's Postgres. These are smoke tests of the wiring, not of behaviour.
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
