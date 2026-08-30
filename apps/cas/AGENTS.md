# cas

Rust (axum) authentication service.

Database migration workflow (sqlx, `cas-migrate`, immutability, expand/contract) is described in
[docs/MIGRATIONS.md](./docs/MIGRATIONS.md).

SQL query and offline cache workflow is described in
[docs/QUERIES.md](./docs/QUERIES.md).

## Tests

```
cd apps/cas
docker compose up -d                                    # once, for the dev DB
DATABASE_URL=postgres://cas:cas@localhost:5434/cas cargo test
```

Repository tests use `#[sqlx::test]`, which needs `DATABASE_URL` in the
environment (it does not read the monorepo `.env` files the app uses). Each such
test gets a throwaway database with the migrations applied, so tests never see
each other's rows and no fixture teardown is needed.
