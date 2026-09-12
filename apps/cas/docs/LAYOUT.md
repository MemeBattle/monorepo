# Layout

How the crate is laid out and which code may live where. The rules are what
matters: the modules named here are the ones that exist today and more will
follow, all in the same shape.

```
apps/cas/
  AGENTS.md            one-screen card for agents, links into docs/
  migrations/          sqlx migrations, immutable once merged   → MIGRATIONS.md
  .sqlx/               offline query cache                       → QUERIES.md
  docs/                workflow documents, ADRs, this file
  src/
    main.rs, bin/*.rs  binaries: load the config, call into the library, nothing else
    lib.rs             the module list
    config.rs          ┐
    db.rs              │ shared infrastructure: knows no context
    migrations.rs      ┘
    testing.rs         test helpers, cfg(test) only
    http/              transport: the only place axum exists
      mod.rs           router, middleware stack, pool construction
      error.rs         ApiError, the error contract on the wire
      <context>/       handlers of a context, with `From<DomainError> for ApiError`
    <context>/         one directory per bounded context (accounts, webauthn, ...)
      mod.rs           domain types, invariants, re-exports
      <concept>.rs     more domain: newtypes, states, rules
      <flow>.rs        services: use cases, orchestration, transaction ownership
      repository.rs    all SQL of the context and all sqlx impls for its types
```

## Layers

Each rule says what a layer is for and what it must not touch.

1. **Domain** — everything in `<context>/` except `repository.rs`. Types,
   invariants, errors. Never imports axum, never writes SQL, never implements
   the sqlx traits by hand. One exception: an enum that mirrors a Postgres enum
   carries `#[derive(sqlx::Type)]` with its `type_name`. Writing that by hand
   gains nothing; anything beyond the derive belongs to the repository.
2. **Services** — the flow files inside a context. They call repositories, open
   and own the transaction, and hand the executor down. Not a line of SQL. A
   service has its own error enum; `sqlx::Error` may appear in it as the
   transport-level cause of a failure, classified by `db` before a transport
   sees it.
3. **Repository** — `<context>/repository.rs`, the only place with SQL for its
   context. Row structs, the row → domain conversion, and the `Type` / `Encode`
   / `Decode` impls for the context's domain types live here, next to the
   queries that use them. Mapping a constraint name to a domain error is the
   repository's job too: only the queries know the constraint. Functions take
   an executor rather than a pool, so a service can compose one transaction
   out of several repositories. When the file outgrows itself it becomes a
   `repository/` directory; the name stays so that it can be grepped.
4. **Transport** — `http/`. Parses the request, calls a service, maps the
   domain error to `ApiError`. Mirrors the contexts: `http/<context>/`. The
   mapping `From<DomainError> for ApiError` lives next to the handler it
   serves. Nothing below `http/` knows about axum.
5. **Shared infrastructure** — `config`, `db`, `migrations`. Used by both
   binaries, knows no context. `db` classifies database failures (unavailable,
   busy, or a bug the code has no name for); a transport only maps that verdict
   to a status.
6. **Dependency direction** — `http → services → repository → db`. Domain types
   are visible to every layer. Contexts talk to each other through their public
   types and services, never through another context's repository.
7. **Tests** live next to the code. Repositories and services are tested with
   `#[sqlx::test]`, transport through the full router. Shared fixtures are in
   `testing.rs`. See TESTS.md.
