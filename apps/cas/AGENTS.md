# cas

Rust (axum) authentication service.

- [docs/LAYOUT.md](./docs/LAYOUT.md) — where code lives: one directory per
  bounded context with its own `repository.rs` (the only SQL) and `http/`
  (the only axum), a transport root that mounts them, shared infrastructure
  that knows no context.
- [docs/MIGRATIONS.md](./docs/MIGRATIONS.md) — migration workflow: sqlx,
  `cas-migrate`, immutability, expand/contract.
- [docs/QUERIES.md](./docs/QUERIES.md) — SQL queries and the offline cache.
- [docs/TESTS.md](./docs/TESTS.md) — test setup and the isolated SQLx
  database workflow.
- [docs/INTEGRATION.md](./docs/INTEGRATION.md) — how an application
  integrates with CAS: registration, the flows, tokens on a resource server,
  guests, logout.
- [docs/adr/](./docs/adr/) — decisions that shaped the schema and the
  ceremonies.
