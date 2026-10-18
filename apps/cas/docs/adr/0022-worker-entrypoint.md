# 22. The Cloudflare Workers entrypoint

## Status

Accepted (2026-10-19), with [#801](https://github.com/MemeBattle/monorepo/issues/801).
Resolves what ADR 0021 (f) deferred: the per-request connection's close, the
configuration from bindings, and the wasm32 build. Follows ADR 0002 (any
replica serves any request, so nothing is kept in memory), ADR 0016 (every
answer described by the generated document, no hand-written catalogue),
ADR 0019 and ADR 0020 (the crypto forks that made the target buildable) and
ADR 0021 (the handle). Nothing on the wire and nothing stored changes; no
migration, no new stable error code, no `openapi.json` change.

Not verified by this ADR, and not claimed: a request served end to end from a
deployed Worker through production Hyperdrive. See (i).

## Context

ADR 0021 gave the fourteen services a `Db` handle so that product code does
not know which runtime it is on: natively a `PgPool`, on Cloudflare Workers an
`Arc<Mutex<PgConnection>>` over the request's one connection. It stopped at the
handle. Nothing opened that connection, nothing closed it, `Config` could only
come from a process environment, and no CI job compiled
`wasm32-unknown-unknown` at all.

What the spike (`docs/spike-sqlx-worker.md`) fixed as the contract: one
`PgConnection` per request from the Hyperdrive binding through
`vendor/sqlx-cloudflare-hd`, with `statement_cache_capacity(0)` and the
Hyperdrive query cache disabled; `cargo sqlx prepare` on the host target, never
through the Worker build; migrations outside the Worker.

Two things about the platform shape everything below.

**Workers bound CPU time, not wall-clock I/O.** An HTTP Worker has no duration
limit while the client stays connected ([Workers limits —
Duration](https://developers.cloudflare.com/workers/platform/limits/#duration)),
so an await on a stalled socket hangs the request for as long as the client
waits. Natively every database wait is already bounded — the pool by
`acquire_timeout`, `/health` by its own `tokio::time::timeout` — and
`tokio::time` does not run on this target.

**Nothing on the Worker stack closes a socket when it is dropped.** sqlx sends
`Terminate` and shuts the stream down only inside `Connection::close`; the
vendored `HdSocket` has no `Drop` of its own; `worker::Socket` holds the JS
socket and stream handles and has no socket-closing `Drop` either. Cloudflare
documents the explicit [`Socket.close()`](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#close-tcp-connections)
as the forcible close of both streams, and gives no guarantee that an unclosed
socket is torn down when the invocation ends — the request-context
documentation says only that unawaited async work *can* be cancelled, which is
a caution, not a cleanup contract. Natively, dropping a `PgConnection` hands
the rest to the tokio runtime; on wasm there is no runtime to hand it to.

## Decision

**(a) One connection per request, from the binding.** The entrypoint
(`src/worker.rs`, `#[event(fetch)]`, wasm32 only) reads the Hyperdrive binding
named `HYPERDRIVE`, takes the options Hyperdrive hands out, sets
`statement_cache_capacity(0)` on them, opens one `PgConnection` and gives it to
the services as `Db::connection`. The Hyperdrive configuration must have its
query cache **disabled**: the cache answers sqlx's `Parse`/`Describe` itself and
the `Bind` that follows lands on the wrong statement (the spike's "Production
Hyperdrive" run, `vendor/sqlx-cloudflare-hd/VENDOR.md`). Provisioning that
configuration is not this work; depending on it is.

**(b) The close: `Db::close`, and a lifecycle that always reaches it.**
`Db::close(self) -> Result<CloseOutcome, sqlx::Error>`. On the connection
variant it is one `Arc::try_unwrap`: the last handle with no outstanding
`DbConn` — a guard holds a clone of the same `Arc`, so one question answers
both — gets the owned connection and a graceful `sqlx::Connection::close`
(`Terminated`); anything else just releases this handle (`Dropped`), and
whoever still holds one keeps using it. On the pool variant, `PgPool::close`
(`Terminated`).

`http::serve_and_close` is the lifecycle: serve the request, buffer the body to
bytes, drop the router — and with it every service's clone of the handle — then
await `Db::close` under a deadline, and only then return both results. The body
is buffered so that "closed after the response" is literal rather than a race
with a body nobody has polled; there is no early return between the serve and
the close, so a response whose body fails still reaches it. It is target-free
and natively tested.

The outcome names describe the **Rust handle**, never the socket.
`Terminated` means the protocol goodbye ran. `Dropped` means it did not.
Neither says the socket is closed — that is (c).

**(c) The socket-cleanup contract: four distinct things.** Conflating them is
what made earlier designs wrong, so they are named separately, each with the
mechanism that provides it:

| | what it does | what it does not |
|---|---|---|
| **cancelling a Rust operation** (dropping a future a deadline lost) | stops our side of it | closes nothing |
| **releasing a handle** (a `DbConn` guard, a `Db` clone dropped) | frees the mutex or the `Arc` | leaves the socket alone |
| **graceful termination** (`sqlx::Connection::close`) | `Terminate`, flush, stream shutdown | best-effort; it awaits the socket, so it is bounded |
| **forcible socket closure** (`SocketAbort::abort()` → JS `Socket.close()`) | closes both streams, Cloudflare's documented forcible close | says nothing about the protocol |

Since nothing closes a socket on drop and no invocation-end cleanup is
documented, the forcible close is explicit and unconditional. The vendored
adapter owns the mechanism: `SocketAbort`, a shared slot over the raw
`worker_sys::Socket` (reachable because `worker_sys::connect` is public, the raw
socket is `Clone`, and `worker::Socket: From<worker_sys::Socket>`), filled by
`connect_with_abort` and re-filled across the `startTls()` swap, so the handle
always points at the live socket; both calls of the swap are synchronous, so no
dropped future can observe a stale one. `abort()` takes the socket out, so it is
idempotent, and invokes the JS `close()` fire and forget. `connect_with` keeps
its upstream shape and delegates with a throwaway handle.

The entrypoint calls it **immediately** when the connect fails or expires — the
socket may be half-open mid-handshake — and **unconditionally** as the last
thing before returning, after the graceful close has had its chance. So: by the
time `fetch` returns, `close()` has been invoked on the JS socket of every
connection the request opened. `serve_and_close` knows nothing about it;
sockets are the entrypoint's business.

**(d) Every database wait on the Worker path is deadline-bounded.**
`deadline::with_deadline(limit, future)`, shared infrastructure beside `db`
(`docs/LAYOUT.md`): `tokio::time::timeout` natively, and on wasm32
`futures_util::future::select` against the Workers timer. The timer is
`worker::Delay` wrapped in `worker::send::SendFuture`, built in one expression.
The wrap is required, not stylistic: `Delay` holds a `wasm_bindgen::Closure` and
an `Rc<Cell<bool>>` and so is not `Send`, while axum demands that every
handler's future be `Send` on every target, and `/health` awaits this. The
wrapper is the worker crate's own, sound because the Workers runtime is
single-threaded. A bare `Delay` must never be a local held across an await, or
the future is `!Send` again.

One budget, `health::DB_TIMEOUT` (2 s), for the connect, the `/health` probe and
the close. It is what the native path already gives both the pool's acquire and
the probe, and per-phase budgets would be numbers with no evidence behind them.
If production Hyperdrive ever needs a different connect budget it is one
constant. Expiry drops the losing future — cancellation, (c) — and answers the
documented unavailable shape.

**(e) `WorkerConfig`: the settings from bindings.** `CAS_RP_ID`, `CAS_ORIGIN`,
`CAS_CORS_ORIGINS` and `CAS_ISSUER` are plain vars — they are public, and two of
them are published by discovery anyway. `CAS_SIGNING_KEY` is a **secret**: it is
the private key every token is signed with, so it is read with `Env::secret`,
the kind a `wrangler secret` value arrives as. Every binding is **required**:
a Worker is a deployment, not a dev shell, so there are no localhost defaults and
no debug default signing key (which ADR 0009 (c) keeps out of releases anyway).
A missing one is `ConfigError::MissingBinding`, naming it.

`port` and `database_url` do not exist there. Nothing listens on a port — the
runtime hands the entrypoint a request — and the database is the Hyperdrive
binding, whose credentials are Hyperdrive's to hold. The validators are the
shared ones `Config::from_env` uses, so a value means the same thing in both
deployments; `WorkerConfig` is compiled on every target, so its parsing is
tested by `cargo test`. Native `Config` and `from_env` are untouched.

**(f) The router is built per request, in two halves.** `AppParts::build` is
everything fallible and database-free — the relying party, the signing key, the
published documents, the cookie settings — and runs **before** a connection
exists. `build_app(parts, db, health)` is infallible. So once there is a
connection, nothing between the open and the close can return early.

`/health` is a parameter of the assembly because the two deployments probe
different things while answering the same contract: natively the process's pool
with its own timeout (ADR 0021 (e), unchanged), on a Worker the request's own
connection through `health::db_router`, where the acquire is part of the probe.
Both reuse the same description and the same `/health` annotation, so the
document does not depend on which is mounted — no `openapi.json` change. The
`db_router` is compiled on **every** target, and the native assembly tests mount
it, so the Worker's health implementation is exercised by `cargo test` rather
than merely compiled.

There is **no request trace** on a Worker. tower-http's `Trace` runs
`std::time::Instant::now()` before the inner service on every request, and that
aborts on wasm32 (ADR 0020), so the layer and its span are native-only — a
passing `cargo check` would otherwise hide a panic. Cloudflare's own request
logs carry the method, path and status, and ADR 0004's guarantee that the
session token never reaches a log holds trivially when nothing is logged. The
CORS, catch-panic, cache-control and normalize-path layers touch no clock and
stay on both targets; `CatchPanicLayer` cannot catch there (a panic is an abort,
which the runtime turns into a 1101), and it stays for the native path.

The per-request cost of the assembly — the PEM parse, the relying party — is
accepted. Profiling CPU time per request is out of scope (the spike measured a
median of 16 ms against the Free plan's 10 ms CPU limit and did not profile).

**(g) Failure semantics, with no new wire contract.** Two failures, two
answers:

- **Misconfiguration** (a missing or invalid binding, a PEM that is not a key)
  is a startup failure: the error is logged with `console_error!` and `fetch`
  returns `Err`, which surfaces as the platform's error page. It is the Worker
  analogue of a native process refusing to start, where no CAS-shaped answer
  exists either because nothing is listening. Nothing is open to leak. Inventing
  per-endpoint misconfiguration responses would itself be a new wire contract,
  which this work rules out, and the "no explicit 500" rule governs the API's
  own answers — here the application never came up.
- **A failed or timed-out connect** aborts the socket, logs, and serves the
  request anyway through `Db::unavailable()` — a handle with no database, whose
  acquire reports `sqlx::Error::PoolClosed`, which `db::classify` already calls
  `Failure::Unavailable`. So the request goes through the **real** router and
  the real middleware and each endpoint answers its own already-documented
  database failure: 503 `database_unavailable` in the `ApiError` shape under
  `/api`, the OAuth-shaped 503 `temporarily_unavailable` on `/oidc/token` and
  `/oidc/userinfo`, the 503 page on `/oidc/end_session`, plain-text
  `DB unavailable` on `/health` — behind the real CORS and cache-control
  headers. This mirrors the native lazy pool, where a database that is down is
  also met per endpoint rather than before routing. No new stable code, no
  `openapi.json` change, ADR 0016 still satisfied by the existing descriptions.

**(h) The wasm build.** Dependencies are split by target under resolver 2, which
keeps a feature enabled for one target out of the other: the native entries are
what the crate had before, and the wasm entries drop what a Worker has no use
for (`tokio` down to `sync`, no `runtime-tokio`, `tls-none` because the Workers
runtime performs the handshake, no `dotenvy`, no `tracing-subscriber`, axum
without `http1`/`tokio`, tower-http without `trace`) and add what it needs
(`worker`, `sqlx-cloudflare-hd`, `futures-util`, `time/wasm-bindgen` so
`OffsetDateTime::now_utc()` reads the JS clock, `uuid/rng-rand`). The three
getrandom majors in the tree each get told where randomness comes from: 0.2 by
its `js` feature, 0.4 by `wasm_js`, and 0.3 by both its feature and the
`getrandom_backend="wasm_js"` cfg in the root `.cargo/config.toml`, which is
target-scoped so no native build sees it. That file has no `[env]` section: a
`SQLX_OFFLINE` entry there would leak into native builds, where
`cargo sqlx prepare` has to reach the database.

`[lib] crate-type = ["cdylib", "rlib"]`: `worker-build` links the entrypoint out
of the cdylib, the rlib is what the binaries and the tests use. No `prepare`
feature: unlike the spike's crate, CAS keeps `runtime-tokio` on the host through
the target split, so `cargo sqlx prepare` works exactly as it did.

CI gets a `lib-wasm` job — `cargo check` and `cargo clippy -D warnings` for
`-p cas --lib --target wasm32-unknown-unknown` with `SQLX_OFFLINE` — and
`.cargo/**` joins the workflow's path filter, so a change to those rustflags
cannot skip the jobs that depend on them. The scope is `--lib` on purpose: the
three binaries (`cas`, `cas-migrate`, `cas-client`) are native-only and stay
that way, `clients::register`'s concrete `&PgPool` included (it compiles under
wasm sqlx, so ADR 0021 (e)'s anticipated `cfg` was not needed).

**(i) What is compile-verified only.** `src/worker.rs` has no native test —
its types exist on one target — so it is kept to the composition of parts that
are each tested natively, and `cargo check`/clippy for wasm32 is its only cover.
The same holds for `SocketAbort`: its slot mechanics are plain Rust, reviewed in
the diff, but the behaviour of the JS `close()` on a live, half-open or
already-closed socket is not runtime-tested here. Named as the unverified
runtime assumption, alongside the clock via `time/wasm-bindgen`, `worker::Delay`
and CPU time per request. The alternative to the explicit abort — relying on
invocation-end cleanup — rests on a guarantee Cloudflare does not document,
which is why it was not chosen. A request served end to end from a deployed
Worker through production Hyperdrive is explicitly **not** claimed.

## Consequences

- The close path and the unavailable handle are tested, not only documented:
  `db.rs` covers the graceful close, both fallbacks, the pool and the
  unavailable handle; `http/mod.rs` serves a request and `/health` on a
  `Db::connection` handle through the exact assembly the Worker builds, pins
  each endpoint's shape under `Db::unavailable()`, and proves the close still
  runs when the response body fails. Deadline expiry is deterministic under
  tokio's paused clock, in `deadline.rs` and in `/health`'s `answer`.
- A later change that moves something fallible after the connect, or returns
  early between the serve and the close, breaks `closes_even_when_the_body_fails`
  rather than leaking a connection in production.
- Native behaviour is unchanged: `app(config)` keeps its signature, builds the
  same lazy pool, mounts the same pool-backed `/health`, and keeps the request
  trace. The split moved code, not behaviour.
- A Worker log reads "pool timed out" where no pool exists, for a nested
  acquire, and `Db::unavailable()` reports `PoolClosed` where nothing was ever
  open. Accepted for the same reason ADR 0021 (d) accepted it: the error
  contract does not change. It is the thing to revisit if the cases ever have
  to be told apart.
- `tracing` is not wired to anything on a Worker, so `Db::close`'s debug line
  goes nowhere; the entrypoint logs the close outcome with `console_log!`
  itself. A Worker-side tracing story is future work.
- The vendored adapter now diverges from upstream PR #16, recorded in its
  `VENDOR.md`. `connect_with` keeps the upstream signature, so a re-sync has to
  carry `abort.rs` and the connect plumbing and nothing else.
- Deployment is still missing and deliberately so: no `wrangler`/`cf`
  configuration, no Worker, no routes, no Hyperdrive provisioning. The
  entrypoint compiles and is linkable; making it run is the next issue, and it
  inherits the binding names from (a) and (e).
