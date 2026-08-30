# Database migrations

Migrations live in `apps/cas/migrations/` and are embedded into the binaries at
compile time (`sqlx::migrate!` in `src/migrations.rs`). They are forward-only
(no down files) with timestamp versions — the sqlx-cli default.

Migrations are applied by the separate `cas-migrate` binary, **never by the
app**: during a rollout, instances must keep serving on the previous schema.
Later `cas-migrate` will run as a k8s job before deploys.

## Tooling

Creating a migration uses [sqlx-cli](https://crates.io/crates/sqlx-cli):

```
cargo install sqlx-cli --no-default-features --features rustls,postgres
```

```
cd apps/cas
sqlx migrate add <name>        # creates migrations/<timestamp>_<name>.sql
```

## Applying migrations

```
cargo run -p cas --bin cas-migrate
```

Reads `DATABASE_URL` exactly like the app (same `.env` handling, same default
pointing at `docker-compose.yml`). Applies pending migrations and exits;
a second run is a no-op. Exits non-zero on failure. sqlx takes an advisory
lock, so concurrent runs are safe.

The app never applies migrations, but dev builds check in the background on
startup and log a warning listing pending migrations. A release build skips the
check entirely; an unreachable DB only logs an info line.

## Immutability

An applied migration is recorded in `_sqlx_migrations` with a checksum, and
`cas-migrate` fails if a file no longer matches. The rule kicks in when a
migration is merged to master or applied to a shared database — from then on,
fix mistakes with a **new** migration. A local WIP migration on your branch is
freely editable; reset your dev DB after editing:

```
docker compose -f apps/cas/docker-compose.yml down -v && docker compose -f apps/cas/docker-compose.yml up -d
cargo run -p cas --bin cas-migrate
```

(`sqlx database reset` does the same if you use sqlx-cli.)

## Expand/contract

Schema changes must keep the previous release working:

1. **Expand** — additive migration (new table/column, nullable or defaulted).
2. Deploy the code that uses it.
3. **Contract** — a migration removing the old shape ships only after no
   deployed code touches it.

A rename is never a single `ALTER ... RENAME`: add the new column, backfill,
switch the code, then drop the old column — spread across releases.

## CI ordering check

`apps/cas/scripts/check-migration-order.sh` (a `cas-pr.yml` job) fails a PR
that adds a migration timestamped older than the newest one on master — sqlx
would never apply it once a newer version is recorded. If it fires, recreate
your migration with a fresh timestamp (`sqlx migrate add`).
