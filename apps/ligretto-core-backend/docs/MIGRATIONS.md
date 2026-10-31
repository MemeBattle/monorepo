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
  `sql` tag. `scripts/check-migrations.sh` fails an added migration that uses Kysely's schema builder (`db.schema`),
  whose calls its contract scan could not read.
- Every migration runs in one transaction. Nothing a transaction cannot hold goes in: no `CREATE INDEX
CONCURRENTLY`, no `ALTER TYPE … ADD VALUE`. The tables are small enough for a plain `CREATE INDEX`.
- Additive, one release ahead of the code that uses it (`adrs/additive-migrations-and-compatibility-matrix.md`).
- Bare package specifiers and erasable TypeScript only (no `enum`, no parameter properties): the file is loaded
  by `tsx` in the entry, by Node's own type stripping in the PGlite tests, and compiled by the Node build.

## Applying them

`pnpm migrate` runs `src/entry/migrate.ts` through `tsx`. Running through `tsx` is what lets Kysely's
`FileMigrationProvider` import the TypeScript sources. The Node build (`pnpm build`) compiles the migrations to
`build/migrations` next to the compiled entry, and `node build/src/entry/migrate.js` applies them
(`adrs/node-build-and-import-specifiers.md`). Kysely records a migration under its name without the extension, so both
runs agree on what is applied.

The entry needs `DATABASE_URL` and, optionally, `LOG_LEVEL`. `src/entry/env.ts` resolves them from, in order:

1. the shell;
2. this package's `.env.development.local` (gitignored), then its `.env.development`;
3. the repository root `.env*` files.

The package file exists because the root files are shared with CAS, which reads `DATABASE_URL` for its own
database. Production sets the environment and no file is read.

In production the release workflow applies them over the direct connection, after checking the built Worker and before
the upload (`adrs/production-deployment-on-workers.md`). `README.md` says how to run one by hand.

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

`pnpm db:codegen --verify` compares instead of writing and exits 1 on a difference. The `schema-current` CI job
migrates an empty Postgres twice, regenerates the file and fails when `git diff` shows a change (§ What CI checks).

## Immutability

A migration that is on master is never edited, renamed or deleted: every database has run it, and Kysely keeps
only its name, not a checksum. Git is the checksum. A mistake gets a new migration. `scripts/check-migrations.sh`
enforces it at review time (§ What CI checks).

## The compatibility window

During a rollout two releases of the code serve at once, and the migration may run before or after the new code
starts. A migration therefore keeps both the previous and the next release working: expand, then contract, across
releases (`adrs/additive-migrations-and-compatibility-matrix.md`).

1. A migration adds: tables, nullable columns, columns with a `DEFAULT`, indexes.
2. Code starts using the new shape only in the release _after_ the migration that created it.
3. Code stops using the old shape; the release _after_ that may ship the migration that removes it.
4. A rename is add + backfill + switch + drop, never `ALTER … RENAME`. `SET NOT NULL` ships only after a backfill,
   with a `DEFAULT`, and once no deployed writer can still write `NULL`. The matrix cannot prove the last part: the
   pull request says which release removed the last writer of `NULL`.

So a column cannot be added and used in the same pull request, and a schema change costs two or three small pull
requests.

## Contract statements

A migration that drops, renames or tightens something carries the marker
`-- contract: <what it removes and which release stopped using it>` as the first line inside the `sql` tag of
its first contract statement. Postgres receives it as a comment, and the reviewer reads it with the SQL:

```ts
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    -- contract: removes users.locale, unused since 0.3.0
    alter table users drop column locale
  `.execute(db)
}
```

`scripts/check-migrations.sh` treats `DROP`, `RENAME`, `ALTER [COLUMN] … [SET DATA] TYPE` and `SET NOT NULL` as
contract statements. It finds them in any case, across line breaks, and around quoted identifiers and block comments.
It over-approximates: `DROP NOT NULL`, `DROP DEFAULT`, `DROP INDEX` and `DROP CONSTRAINT` need the marker too, which
costs one line.

Only the SQL comment `-- contract:` is the marker. A `// contract:` comment is not, and neither is a `-- contract:`
inside a `//` comment or a `/* … */` block comment. The script ignores every other comment, so a comment that mentions
a drop is not a statement, and neither are the marker's own words. A comment runs from where it starts to its own end:
a `--` or a `//` inside a block comment does not end it early.

One marker per migration, before the first contract statement of the file. A marker after the statement does not
count, even one at the end of the statement's own line. Review, not the script, judges the marker's text and the
release named for `SET NOT NULL`.

## What CI checks

`.github/workflows/ligretto-core-backend-pr.yml` runs, on every pull request of this package:

- `migration-checks`: `scripts/check-migrations.sh` against the base branch, with full history. It fails when
  the pull request
  - edits, renames or deletes a migration that is on master: restore it and add a new migration;
  - adds a file to `migrations/` not named `<yyyymmddHHMMSS>_<name>.ts` (lowercase name, digits and `_`): rename
    it, or move what is not a migration out of the folder;
  - adds a migration whose timestamp is not newer than the newest on master, which Kysely would refuse at run time:
    recreate it with `date -u +%Y%m%d%H%M%S`;
  - adds a contract statement without a leading marker (§ Contract statements): add the marker, after checking the
    release order above;
  - adds a migration that uses Kysely's schema builder (`db.schema`): write the DDL in the `sql` tag (§ Adding one).

  The script compares commits (`<base>...HEAD`): a migration is checked once it is committed, not while it is
  staged. Run it locally with `apps/ligretto-core-backend/scripts/check-migrations.sh origin/master`.

- The compatibility matrix, `scripts/check-schema-compat.sh` with three sets of arguments. Each job applies one
  tree's migrations to its own empty Postgres with `pnpm migrate`, regenerates the other tree's
  `schema.generated.ts` from that schema and runs `pnpm ts-check` there. "master" is the tip of the base branch.

  | Job               | Migrations | Code                             | A failure means                                                                                                                                                                                      |
  | ----------------- | ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `schema-current`  | PR         | PR                               | `schema.generated.ts` is stale (migrate, `pnpm db:codegen`, commit it), or the code does not compile on its own schema.                                                                              |
  | `schema-previous` | master     | PR                               | the code uses a shape this pull request's migration introduces: ship the migration alone first, the code in the next release.                                                                        |
  | `code-previous`   | PR         | master, and master's store suite | the migration removes or tightens a shape master still uses, or master's store suite (the raw lock statements, the migrate entry) breaks on the new schema: ship the code that stops using it first. |

## What the matrix proves and what it does not

It proves that every _builder_ statement of either release names columns the other release's schema has, with
compatible types, and that every `INSERT` supplies what the schema requires (`Insertable<>` makes a `NOT NULL`
column without a default mandatory). It does not see identifiers inside raw SQL, `CHECK` and `UNIQUE` constraints,
the semantics of data (an old writer putting a value the new reader interprets differently) or the behaviour of
defaults. Those stay with review and the store tests. Running master's store suite in `code-previous` at least
executes the raw lock statements on the new schema.

## Rehearsing the matrix locally

`scripts/check-schema-compat.sh --migrations <tree> --code <tree> [--store]` is the script of the three jobs; a tree
is a repository root. When the trees differ, it swaps the chosen `migrations/` folder into the code tree and
restores it on exit, Ctrl-C included, so uncommitted migrations survive. If the process is killed outright, the
original folder is in the temporary directory the script printed, and
`git checkout -- apps/ligretto-core-backend/migrations` recovers the committed files. The regenerated
`schema.generated.ts` stays in place. Kysely refuses a database that recorded a migration the tree lacks, so every
variant needs an empty schema. From the repository root, against the store test database:

```sh
docker compose up -d --wait ligretto-core-pg-test
export DATABASE_URL=postgres://ligretto-core-user:ligretto_pg_password@localhost:5435/ligretto-core-test
export LIGRETTO_CORE_TEST_DATABASE_URL=$DATABASE_URL
reset() { docker compose exec -T ligretto-core-pg-test psql -U ligretto-core-user -d ligretto-core-test \
  -c 'drop schema public cascade' -c 'create schema public'; }
base=$(mktemp -d); git archive origin/master apps/ligretto-core-backend/migrations | tar -x -C "$base"
prev=$(mktemp -d); git archive origin/master | tar -x -C "$prev"; (cd "$prev" && pnpm install --frozen-lockfile)
compat=apps/ligretto-core-backend/scripts/check-schema-compat.sh

reset; $compat --migrations . --code .                    # schema-current
reset; $compat --migrations "$base" --code .              # schema-previous
reset; $compat --migrations . --code "$prev" --store      # code-previous
git checkout -- apps/ligretto-core-backend/src/adapters/pg/schema.generated.ts; rm -rf "$base" "$prev"
```

## A development database

The first migration expects an empty database. The `ligretto-core` database of the root `docker-compose.yml`
(port 5433) may still carry the tables of the previous service, deleted in #842, which have the same names, so
`pnpm migrate` fails on `users`. Drop its `public` schema:

```sh
psql postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core \
  -c 'drop schema public cascade' -c 'create schema public'
```

or give this package a database of its own and point the override at it:

```sh
psql postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/postgres -c 'create database "ligretto-core-hono"'
echo 'DATABASE_URL=postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core-hono' \
  > apps/ligretto-core-backend/.env.development.local
pnpm --filter @memebattle/ligretto-core-backend migrate
```

`pnpm migrate`, `pnpm db:codegen` and the Node entry all pick up the override. While developing the Worker, put the
same string in the Hyperdrive bindings' `dev.connectionString` in `cloudflare.config.ts`.

## Tests

The PGlite suites (`pnpm test`) apply the same migrations in-process with the same provider. The store suite
(`pnpm test:store`) runs the entries themselves against the `ligretto-core-pg-test` compose service on port 5435, or
against the database `LIGRETTO_CORE_TEST_DATABASE_URL` names. It wipes that database first and refuses one whose
name does not end in `-test`.
