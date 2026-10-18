# 21. A `Db` handle instead of a `PgPool` in the services

## Status

Accepted (2026-10-18), with [#799](https://github.com/MemeBattle/monorepo/issues/799).
Follows ADR 0002 (any replica finishes a ceremony, so nothing is kept in
memory) and the wasm work of ADR 0019 and ADR 0020. Nothing on the wire and
nothing stored changes; no migration.

## Context

CAS is being prepared to run on Cloudflare Workers (`wasm32-unknown-unknown`
through workers-rs), reaching Postgres through Cloudflare Hyperdrive. The
crypto and driver blockers are gone, and the spike in
`docs/spike-sqlx-worker.md` established how a Worker talks to the database:

- a `PgPool` cannot exist there. Its semaphore panics without a runtime, it
  spawns tasks and uses `rt::timeout`/`rt::sleep`, and Cloudflare forbids a
  socket from being shared between requests;
- so on Workers the database is **one `PgConnection` per request**, opened
  from the Hyperdrive binding through `vendor/sqlx-cloudflare-hd` with the
  statement cache off, and closed when the request ends;
- natively CAS keeps its pool, with the statement cache on.

Until now `http::app` built one `PgPool` and cloned it into fourteen
services, which called `self.pool.begin()` in ten places and passed
`&self.pool` as a `PgExecutor` in nineteen more. Product code must not know
which of the two runtimes it is on, and the queries themselves — 178 of them,
all in the per-context `repository.rs` — must not have to change for it.

## Decision

**(a) One handle, two runtimes.** `src/db.rs`, the shared infrastructure that
knows no context (`docs/LAYOUT.md` §5), owns `Db`: natively a `PgPool`, on
Workers an `Arc<Mutex<PgConnection>>` over the request's one connection,
which the Worker entrypoint builds with `Db::connection`. `Db::pool` is the
native constructor, and `From<PgPool>` exists so an `#[sqlx::test]` fixture
keeps building a service from the pool the macro hands it. Cloning is cheap
and shares the pool, or the one connection: `http::app` builds a single
handle and every service holds a clone. The connection-backed variant is
compiled on every target, so its contract is exercised by `cargo test`
natively; the pool variant is not named on wasm32 at all.

**(b) Services acquire, then run.** `Db::acquire` hands back a `DbConn`,
which derefs to `PgConnection`: `&mut *conn` is the executor a repository
takes, `conn.begin()` the transaction a service opens. So a service method is
one line different from what it was — `let mut conn = self.db.acquire()
.await?;` before the first operation — and the repositories keep their
`E: sqlx::PgExecutor<'e>` free functions, their SQL and the `.sqlx` cache
exactly as they were.

**(c) Where the acquire goes.** Immediately before the method's first direct
database operation: after the validation that needs no database has passed,
and after any service it delegates to — which acquires for itself — has
returned. That one guard is then reused for the rest of the method, and a
method that only delegates (`PasskeyManagement::list`, every
`EndSessionService` path) acquires nothing. Never at method entry by rote:
`UserInfoService::userinfo` must keep refusing a bad token, and
`TokenService::mint_guest` an unauthorized client, without touching the
database, and `AdditionService::start` must let the repository's own acquire
finish before taking the connection for its ceremony.

**(d) Nested acquires are a bug, surfaced as a 503.** On Workers there is one
connection per request, so a holder of a `DbConn` must not call into anything
that acquires again: the connection travels down as `&mut PgConnection` — as
an open transaction already did — never as the `Db`. On the
connection-backed variant `acquire` uses `try_lock_owned`, so a second
overlapping acquire fails at once rather than deadlocking. It fails as
`sqlx::Error::PoolTimedOut`, which `db::classify` already calls
`Failure::Unavailable` and the one `From<sqlx::Error> for ApiError` already
answers with 503 `database_unavailable`: a retryable failure, no new error
code, and never an explicit 500. Reusing an existing variant means a Worker
log will read "pool timed out" where no pool exists; that is accepted for a
zero-surface error contract, and is the thing to revisit if the two ever have
to be told apart.

**(e) What does not change.** The 178 query sites and every repository
signature; `.sqlx` and the migrations; native pooling, with the pool's
`acquire_timeout` and statement cache; the HTTP contract. `/health` keeps the
`PgPool` itself and its `DB_TIMEOUT`: it probes the process's connectivity
with a timeout of its own, not a request's. `src/bin/client.rs` keeps passing
`&pool` to the repository free functions, which is still a `PgExecutor`.

**(f) Deferred.** The Worker entrypoint that opens the per-request connection
from the Hyperdrive binding, hands it over as `Db::connection` and closes it
at the end of the request; `Config` from Worker bindings; the wasm feature
flags. The `#[cfg(target_arch = "wasm32")]` arms are written here but nothing
in CI compiles that target yet, so `cargo check --target
wasm32-unknown-unknown` is not expected to pass.

## Consequences

- A service method now holds one connection for its duration instead of
  checking one out per query. On the pool variant the pressure is bounded by
  the number of concurrent requests, exactly as `begin()` already bounded it;
  `sessions::concurrent_requests_renew_once` pins that pooled acquires still
  run concurrently.
- `SessionService::authenticate` rolls its renewal transaction back
  explicitly where it used to drop it: the reads that follow run on the same
  connection, which has to be out of the transaction first.
- Constructors take `impl Into<Db>` rather than a bare `Db`, so the roughly
  160 existing `::new(pool, …)` call sites in tests and `src/testing.rs`
  compile unchanged. `Db::from(pool)` is what `.into()` runs.
- The single-connection contract is tested, not only documented: `db.rs`
  covers acquire, begin/commit/rollback and the contention error, and four
  services are exercised on a `Db::connection` handle — the delegate-then-
  acquire path (`AdditionService::start`), the cross-service one
  (`TokenService` → `AuthorizationService` → `ClientRepository`), the deepest
  sequential one (`SessionService::authenticate`), and the
  validation-before-acquire refusals of `/oidc/userinfo`.
- A later change that adds a nested acquire fails those tests rather than
  hanging a Worker request.
