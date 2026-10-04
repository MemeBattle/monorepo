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
      error.rs         ApiError, the error contract on the wire; api_errors!, error_set!
      response.rs      what handlers return, each type also its own description
      openapi.rs       the OpenAPI document: assembly, /openapi.json, the tests' check (ADR 0016)
      fetch_metadata.rs  the CSRF line on /api (ADR 0005)
    <context>/         one directory per bounded context (accounts, clients, oidc, webauthn, ...)
      mod.rs           domain types, invariants, re-exports
      <concept>.rs     more domain: newtypes, states, rules
      <flow>.rs        services: use cases, orchestration, transaction ownership
      repository.rs    all SQL of the context and all sqlx impls for its types
      http/            the context's handlers, with an `api_errors!` table per domain error
```

## Layers

Each rule says what a layer is for and what it must not touch.

1. **Domain** — everything in `<context>/` except `repository.rs` and `http/`. Types,
   invariants, errors. Never imports axum, never writes SQL, never implements
   the sqlx traits by hand. One exception: an enum that mirrors a Postgres enum
   carries `#[derive(sqlx::Type)]` with its `type_name`. Writing that by hand
   gains nothing; anything beyond the derive belongs to the repository. By the
   same reasoning, a domain type that is already serialized on the wire as it
   is may carry `#[derive(utoipa::ToSchema)]` for the OpenAPI description
   (ADR 0016 (k)); anything beyond the derive belongs to the transport.
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
   `ApiError`, the extractors, the response types, the OpenAPI document. A
   context's handlers live inside the context, parse the request, call a
   service and map the domain error to `ApiError`; the mapping is an
   `api_errors!` table, which yields both `From<DomainError> for ApiError`
   and the codes the error can produce, and it sits next to the handler it
   serves. A handler is annotated with `#[utoipa::path]`, returns one of the
   response types of `http/response.rs` (or `http/extract.rs`'s `Json`) and
   fails with `ApiErrors<Set>`, its error set declared with `error_set!`:
   the errors its body converts and the markers of its extractors. Its
   operation id reads on its own, verb first (`list_passkeys`, `get_me`):
   generated clients name their functions and types after it, and a handler
   whose name leans on its module (`list`) sets `operation_id`. A
   context's router is an `OpenApiRouter` that mounts handlers only through
   `routes!`, so nothing is served that is not described (ADR 0016). The
   root mounts each context's router and never reaches past it. axum exists
   nowhere but these two places. There are three mounts (ADR 0017): `/api`,
   the first-party API, whose contract (the CSRF line, `no-store`, the
   `ApiError` shape) an endpoint gets by being nested there; `/oidc`, the
   OpenID Connect protocol endpoints, a prefix each handler writes into its
   own path, with no layer or fallback of its own; and the root, for
   discovery, `/health` and `/openapi.json`.
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
