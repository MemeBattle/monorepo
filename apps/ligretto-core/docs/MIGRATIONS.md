# Migrations

How the schema of this package changes. The decisions behind it are `adrs/database-access-with-kysely.md` and
`adrs/additive-migrations-and-compatibility-matrix.md`; the tables and their invariants are `DESIGN.md` § Data.

## Where they live

`migrations/<yyyymmddHHMMSS>_<name>.ts`, the timestamp in UTC (`date -u +%Y%m%d%H%M%S` when the file is created).
The width is fixed, so Kysely's sort by name is the order in time. The folder holds migrations and nothing else:
the provider imports every `.ts` file in it.

## Adding one

```ts
// What this migration does and why. Immutable once on master.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table users add column locale text`.execute(db)
}
```

- `up` only. Migrations are forward-only; a mistake is corrected by the next migration.
- DDL in the `sql` tag, one statement per `execute`, so a reviewer reads SQL. The rest of the code never uses the
  `sql` tag.
- Every migration runs in one transaction. Nothing a transaction cannot hold goes in: no `CREATE INDEX
CONCURRENTLY`, no `ALTER TYPE … ADD VALUE`. The tables are small enough for a plain `CREATE INDEX`.
- Additive, one release ahead of the code that uses it (`adrs/additive-migrations-and-compatibility-matrix.md`).
- Bare package specifiers and erasable TypeScript only (no `enum`, no parameter properties): the file is loaded
  by `tsx` in the entry and by Node's own type stripping in the PGlite tests.

## Applying them

`pnpm migrate` runs `src/entry/migrate.ts` through `tsx`. Running through `tsx` is what lets Kysely's
`FileMigrationProvider` import the TypeScript sources; there is no compiled copy of the migrations. A Node image that
cannot run `tsx` would need the migrations compiled next to a compiled entry, which is a change to this document.

The entry needs `DATABASE_URL` and, optionally, `LOG_LEVEL`. `src/entry/env.ts` resolves them from, in order:

1. the shell;
2. this package's `.env.development.local` (gitignored), then its `.env.development`;
3. the repository root `.env*` files.

The package file exists because the root files are shared with CAS, which reads `DATABASE_URL` for its own
database. Production sets the environment and no file is read.

It logs one JSON line per applied migration (`migration`, with `name`, `status`, `direction`), or `no pending
migrations`. A failure, such as an unreachable database or a failing statement, is logged as `migration_failed`
and exits with code 1. Kysely reports a failure in its result set instead of throwing it, and the entry checks that
result. A second run on a migrated database applies nothing and exits 0. `allowUnorderedMigrations` is off: a
migration older than one already applied is an error.

The bookkeeping tables are Kysely's `kysely_migration` and `kysely_migration_lock`. Nothing but `pnpm migrate`
touches them.

## Regenerating the row types

After a migration, `pnpm db:codegen` regenerates `src/adapters/pg/schema.generated.ts` from the migrated database
and the result is committed with the migration. It is `src/entry/codegen.ts`, which resolves `DATABASE_URL` through
the same loader as `pnpm migrate` and hands it to `kysely-codegen` as a literal URL, so it reads the database the
migration just ran against. The generator's own env-file handling never runs. Nobody edits the generated file.

`pnpm db:codegen --verify` compares instead of writing and exits 1 on a difference. CI migrates an empty Postgres
twice, regenerates the file and fails when `git diff` shows a change.

## Immutability

A migration that is on master is never edited, renamed or deleted: every database has run it, and Kysely keeps
only its name, not a checksum. Git is the checksum. A mistake gets a new migration.

## A development database

The first migration expects an empty database. The `ligretto-core` database of the root `docker-compose.yml`
(port 5433) may still carry the schema of `ligretto-core-backend`, whose tables have the same names. Do not delete
the compose volume, which holds that service's development data. Give this package a database of its own instead:

```sh
psql postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/postgres -c 'create database "ligretto-core-hono"'
echo 'DATABASE_URL=postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core-hono' \
  > apps/ligretto-core/.env.development.local
pnpm --filter @memebattle/ligretto-core migrate
```

`pnpm migrate`, `pnpm db:codegen` and the Node entry all pick up the override. While developing the Worker, put the
same string in the Hyperdrive bindings' `dev.connectionString` in `cloudflare.config.ts`.

## Tests

The PGlite suites (`pnpm test`) apply the same migrations in-process with the same provider. The store suite
(`pnpm test:store`) runs the entries themselves against the `ligretto-core-pg-test` compose service on port 5435, or
against the database `LIGRETTO_CORE_TEST_DATABASE_URL` names. It wipes that database first and refuses one whose
name does not end in `-test`.
