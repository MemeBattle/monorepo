# cas

Rust (axum) authentication service.

- [docs/LAYOUT.md](./docs/LAYOUT.md) — where code lives: one directory per
  bounded context, SQL only in `repository.rs`, axum only in `http/`, shared
  infrastructure that knows no context.
- [docs/MIGRATIONS.md](./docs/MIGRATIONS.md) — migration workflow: sqlx,
  `cas-migrate`, immutability, expand/contract.
- [docs/QUERIES.md](./docs/QUERIES.md) — SQL queries and the offline cache.
- [docs/TESTS.md](./docs/TESTS.md) — test setup and the isolated SQLx
  database workflow.
- [docs/adr/](./docs/adr/) — decisions that shaped the schema and the
  ceremonies.
