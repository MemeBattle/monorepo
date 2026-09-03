# cas

Rust (axum) authentication service.

Database migration workflow (sqlx, `cas-migrate`, immutability, expand/contract) is described in
[docs/MIGRATIONS.md](./docs/MIGRATIONS.md).

SQL query and offline cache workflow is described in
[docs/QUERIES.md](./docs/QUERIES.md).

Test setup and the isolated SQLx database workflow are described in
[docs/TESTS.md](./docs/TESTS.md).

Decisions that shaped the schema and the ceremonies are recorded as ADRs in
[docs/adr/](./docs/adr/).
