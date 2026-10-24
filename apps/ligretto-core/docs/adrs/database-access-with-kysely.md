---
title: Database access with Kysely
description: Kysely over `pg` is the only way to the database. Row types are generated from the migrated schema by kysely-codegen and committed; migrations are TypeScript files with SQL inside, applied by Kysely's Migrator from a dedicated entry, never by the serving process.
read_when:
  - writing or changing a query, a table or a migration
  - running or baselining migrations against a database
  - adding a runtime that needs a database connection
  - choosing how a test gets a database
---

# Database access with Kysely

## Context

The service has about twenty statements: a handful for games and rounds, one for users, eight in the session store,
a few in the sweep. An ORM buys little at that size and the previous one (Lucid) cost a naming-strategy incident and
a connection pool that cannot live on Workers. Two things are still required: types for rows that come from the
schema rather than from hand-written interfaces, so the compiler can check code against a schema it did not ship
with (`additive-migrations-and-compatibility-matrix.md`), and migrations that run from a release step. There is no
data to carry over: the schema starts from scratch.

## Decision

- **Query builder, not ORM.** `kysely` with `PostgresDialect` over `pg`. Raw SQL goes through Kysely's `sql` tag
  (the session lock's `SELECT … FOR UPDATE` does). No other database client is imported anywhere.
- **Types from the schema.** `kysely-codegen` connects to a database that has every migration applied and writes
  `src/adapters/pg/schema.generated.ts`. The file is committed. A CI job regenerates it from a freshly migrated
  database and fails on a diff, the way CAS checks its `.sqlx` cache. Nobody edits the generated file.
- **Migrations.** `migrations/<timestamp>_<name>.ts` exporting `up` (and `down` only where it is cheap and true;
  migrations are forward-only in practice). SQL inside via `sql\`…\`.execute(db)`, so a reviewer reads SQL. Applied
by Kysely's `Migrator`with`FileMigrationProvider`from`src/entry/migrate.ts`, which loads the same `Config`as the service, runs`migrateToLatest()`and exits non-zero on failure. The serving process never migrates.`allowUnorderedMigrations` stays off: a migration older than one already applied is an error, which is the
  ordering guard.
- **First migration.** Creates the whole schema of `DESIGN.md` (`users`, `games`, `rounds`, `round_users`,
  `sessions`, `auth_requests`, `session_locks`) with this package's conventions. Nothing is inherited from the
  previous service's schema and nothing is marked applied by hand: every database, production included, runs it.
- **Connections per runtime.** On Node one `pg.Pool` for ordinary statements and one for lock transactions (see
  `session-store-locking.md`), both living for the process. On Workers a `pg` client is opened per request on the
  Hyperdrive connection string — a second one only when a request takes a session lock — and closed in
  `ctx.waitUntil`. The adapters receive a `Kysely<DB>` instance and do not know which of the two produced it.
- **Tests.** Unit and HTTP tests run the same migrations into PGlite in-process through a PGlite dialect; no Docker,
  no CLI. Store tests that need two concurrent connections run against the Docker Postgres (`testing-strategy.md`).

Rejected: `pgtyped` (per-query types from `PREPARE`; it cannot see that an `INSERT` omits a new `NOT NULL` column,
which Kysely's `Insertable<>` does), `node-pg-migrate` (needs a `pg` connection, so tests could not apply migrations
into PGlite), Drizzle (schema-as-code plus drizzle-kit would be a second source of truth next to the codegen we need
anyway).

## Consequences

- A column rename or removal is a compile error in every query that used it, in this code and in the code the
  compatibility matrix type-checks.
- A new table or column is written twice: the migration and, after regenerating, nothing — the types follow.
- There is no `kysely_migration` CLI to learn: `pnpm migrate` is the entry; `pnpm db:codegen` regenerates types.
- Applied migrations are immutable by policy (CI fails a PR that edits one already on master); Kysely does not
  checksum them, git does.
