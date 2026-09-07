# cas

Rust (axum) authentication service.

## Layout

- `accounts` and `webauthn` (with `ceremonies`, `passkeys`, `registration`) are
  the domain modules. They never import axum.
- `http` is the only transport layer: the router, the middleware stack, the
  handlers, and `ApiError` with the domain-error → HTTP mappings that live next
  to the handlers they belong to.
- `config`, `db` and `migrations` are shared infrastructure, used by both
  binaries. `db` classifies database failures (unavailable, busy, or a bug the
  code has no name for), so a transport only maps that verdict to a status.
- `testing` holds the test helpers and is compiled only for `cfg(test)`.
- `main.rs` and `bin/migrate.rs` are thin: they load the config and call into
  the library.

Database migration workflow (sqlx, `cas-migrate`, immutability, expand/contract) is described in
[docs/MIGRATIONS.md](./docs/MIGRATIONS.md).

SQL query and offline cache workflow is described in
[docs/QUERIES.md](./docs/QUERIES.md).

Test setup and the isolated SQLx database workflow are described in
[docs/TESTS.md](./docs/TESTS.md).

Decisions that shaped the schema and the ceremonies are recorded as ADRs in
[docs/adr/](./docs/adr/).
