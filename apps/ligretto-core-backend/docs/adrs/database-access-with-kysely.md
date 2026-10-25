---
title: Database access with Kysely
description: >-
  Kysely over pg is the only way to the database; application statements use the query builder, raw SQL is for the
  lock transaction's SET LOCAL lock_timeout and the DDL of migrations alone. Row types are generated from the
  migrated schema by kysely-codegen and committed; migrations are TypeScript files applied by Kysely's Migrator from a
  dedicated entry, never by the serving process. On Workers every connection goes through cache-disabled Hyperdrive
  configurations.
read_when:
  - writing or changing a query, a table or a migration
  - running migrations against a database, locally or in a release
  - adding a runtime that needs a database connection, or touching how connections are made
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

On Workers the database is reached through Hyperdrive, which caches eligible `SELECT`s for a minute by default and
never invalidates them on a write. Every read this service makes is a session, a pending sign-in or a profile
written moments ago; a cached read of a refresh token that was just rotated is a revoked grant.

## Decision

- **Query builder, not ORM.** `kysely` with `PostgresDialect` over `pg`. Application statements (every `SELECT`,
  `INSERT`, `UPDATE`, `DELETE` of the repositories, the store and the sweep) use the builder, so their identifiers
  are checked against the generated `DB` type. Raw SQL through Kysely's `sql` tag is the lock transaction's
  `SET LOCAL lock_timeout` (`session-store-locking.md`), which takes no bind parameter, and the DDL of migrations,
  nowhere else; the lock insert and the `FOR UPDATE` select go through the builder. The compiler cannot see
  identifiers inside a raw string, and the compatibility matrix relies on it seeing them.
- **Types from the schema.** `kysely-codegen` connects to a database that has every migration applied and writes
  `src/adapters/pg/schema.generated.ts`. It runs from `src/entry/codegen.ts` (`pnpm db:codegen`) with the database
  section of the configuration, resolved like the migrator's, never from the generator's own env-file handling, so
  both always reach the same database. The file is committed. A CI job regenerates it from a freshly migrated
  database and fails on a diff, the way CAS checks its `.sqlx` cache. Nobody edits the generated file.
- **Migrations.** `migrations/<timestamp>_<name>.ts`, each exporting `up` (and `down` only where it is cheap and
  true; migrations are forward-only in practice). The DDL is written with the `sql` tag, so a reviewer reads SQL.
  They are applied by Kysely's `Migrator` with a `FileMigrationProvider` from `src/entry/migrate.ts`, which loads
  the database section of the configuration, calls `migrateToLatest()`, inspects the returned result set
  (`migrateToLatest()` reports failures in its result, it does not throw them), logs each migration's outcome and
  exits non-zero when `error` is set. The serving process never migrates. `allowUnorderedMigrations` stays off: a
  migration older than one already applied is an error, which is the ordering guard. Every migration runs in a
  transaction, so nothing a transaction cannot hold (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE` on old
  engines) goes into one; the tables are small enough that plain `CREATE INDEX` is the rule.
- **First migration.** Creates the whole schema of `DESIGN.md` § Data (`users`, `games`, `rounds`, `round_users`,
  `sessions`, `auth_requests`, `session_locks`) with the invariants listed there. Nothing is inherited from the
  previous service's schema and nothing is marked applied by hand: every database, production included, runs it.
- **Connections per runtime.** The adapters receive `Kysely<DB>` instances and do not know what produced them.
  On Node two `pg.Pool`s live for the process: `main` for ordinary statements and `locks` for lock transactions
  (`session-store-locking.md`). On Workers two Hyperdrive configurations point at the same database, both with
  **query caching disabled** (`--caching-disabled`): `HYPERDRIVE_MAIN` and `HYPERDRIVE_LOCKS`, the same split as
  the pools, so lock holders cannot exhaust the origin connections the holder's own writes need. The apps are
  composed once per isolate, so there is one `Kysely<DB>` per handle per isolate. Its `PostgresDialect` gets a
  pool-shaped object (`connect()` returning a client with `query` and `release`) that hands out the current
  request's client, found through an `AsyncLocalStorage` scope the entry runs every request in
  (`src/entry/request-scope.ts`), and leases that client to one acquirer at a time, so a transaction and a later
  statement of the same request on one handle never interleave on the client; the lease is per client, so another
  request's client on the same handle is never delayed. A request opens a `pg` client on `HYPERDRIVE_MAIN` lazily,
  on its first statement, and one on `HYPERDRIVE_LOCKS` only when it takes a session lock. The scope closes them in
  `ctx.waitUntil` after the response; nothing that must be durable happens there — every write is awaited before
  the response is sent.
- **Tests.** Repository tests and HTTP tests that do not go through the session store run against PGlite
  in-process with Kysely's built-in `PGliteDialect`, applying the real migrations in `beforeAll`. The session
  store needs two independent connections even for a single request, and PGlite has one, so everything that
  exercises the real store runs against the Docker Postgres; HTTP tests of the auth routes on PGlite use the
  in-memory `SessionStore` of `ligretto-auth` (`testing-strategy.md`).

Rejected: `pgtyped` (per-query types from `PREPARE`; it cannot see that an `INSERT` omits a new `NOT NULL` column,
which Kysely's `Insertable<>` does), `node-pg-migrate` (needs a `pg` connection, so tests could not apply migrations
into PGlite), Drizzle (schema-as-code plus drizzle-kit would be a second source of truth next to the codegen we need
anyway), a cached Hyperdrive binding for "safe" reads (there is no read in this service that tolerates a stale
answer; one configuration per pool, both uncached, is simpler to reason about).

## Consequences

- A column rename or removal is a compile error in every builder statement that used it, in this code and in the
  code the compatibility matrix type-checks; the migrations are the one place a reviewer checks by hand.
- A new table or column is written twice: the migration and, after regenerating, nothing — the types follow.
- The bookkeeping tables are Kysely's defaults, `kysely_migration` and `kysely_migration_lock`; `pnpm migrate` is
  the only way they are touched, `pnpm db:codegen` regenerates the types.
- Applied migrations are immutable by policy (CI fails a PR that edits one already on master); Kysely does not
  checksum them, git does.
- Provisioning a Hyperdrive configuration with caching enabled is a defect; #843 verifies both configurations are
  cache-disabled before the first deploy.

upd (2026-10-24): the Worker's handles are one `Kysely<DB>` each per isolate, resolving the request's lazily opened
client through an `AsyncLocalStorage` scope owned by the entry; the row types are generated from
`src/entry/codegen.ts` with the configuration's database section, like the migrator
([#833](https://github.com/MemeBattle/monorepo/issues/833)).

upd (2026-10-24): raw SQL in the store is only `SET LOCAL lock_timeout`, the lock statements use the builder; the
Worker's pool-shaped object leases each request's client to one acquirer at a time
([#836](https://github.com/MemeBattle/monorepo/issues/836)).
