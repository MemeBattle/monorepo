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
    shared/            shared vocabulary: rules and types more than one context
      label.rs           needs and none owns (a user-facing label's rules)
    testing.rs         test helpers, cfg(test) only
    http/              transport root: mounts the contexts, owns the wire contract
      mod.rs           router, middleware stack, pool construction
      error.rs         ApiError, the error contract on the wire
      fetch_metadata.rs  the CSRF line on /api (ADR 0005)
    <context>/         one directory per bounded context (accounts, webauthn, ...)
      mod.rs           domain types, invariants, re-exports
      <concept>.rs     more domain: newtypes, states, rules
      <flow>.rs        services: use cases, orchestration, transaction ownership
      repository.rs    all SQL of the context and all sqlx impls for its types
      http/            the context's handlers, with `From<DomainError> for ApiError`
```

## Layers

Each rule says what a layer is for and what it must not touch.

1. **Domain** — everything in `<context>/` except `repository.rs` and `http/`. Types,
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
4. **Transport** — `http/` at the crate root and `<context>/http/`. The root
   owns what is shared on the wire: the router, the middleware stack,
   `ApiError`, the extractors. A context's handlers live inside the context,
   parse the request, call a service and map the domain error to `ApiError`;
   the mapping `From<DomainError> for ApiError` sits next to the handler it
   serves. The root mounts each context's router and never reaches past it.
   axum exists nowhere but these two places.
5. **Shared infrastructure** — `config`, `db`, `migrations`. Used by both
   binaries, knows no context. `db` classifies database failures (unavailable,
   busy, or a bug the code has no name for); a transport only maps that verdict
   to a status.
6. **Shared vocabulary** — `shared/`. Domain-level rules and types that at
   least two contexts need and none of them owns: the rules for a user-facing
   label are the first. The bar for entry is that second context; a rule one
   context uses stays in that context. No axum, no SQL, no configuration.
   A context's newtype over a shared rule (`DisplayName`, `PasskeyName`)
   stays in the context, with an error type of its own, so the wire error
   code stays next to the handler that maps it.
7. **Dependency direction** — `http → <context>/http → services → repository → db`. Domain types
   are visible to every layer. Contexts talk to each other through their public
   types and services, never through another context's repository, and never
   reach into another context for a rule: what two contexts share lives in
   `shared/`.
8. **Tests** live next to the code. Repositories and services are tested with
   `#[sqlx::test]`, transport through the full router. Shared fixtures are in
   `testing.rs`. See TESTS.md.
