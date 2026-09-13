# SQL queries

SQLx queries use compile-time-checked macros backed by the committed `.sqlx/`
offline cache. This lets builds validate queries against the schema without a
live database.

## Refreshing the offline cache

After changing SQL or a migration, refresh the cache against the development
database with all migrations applied:

```
cd apps/cas
docker compose up -d
cargo run --bin cas-migrate
cargo sqlx prepare
```

Commit the resulting `.sqlx/` changes together with the SQL or migration.

## Updating SQLx

When updating the `sqlx` crate, install the matching `sqlx-cli` version and
regenerate the cache. The cache format can change between SQLx versions, so a
CLI/crate version mismatch can cause false freshness check failures.
