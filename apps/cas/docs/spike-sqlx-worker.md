# Spike: sqlx inside a Worker over Hyperdrive

Throwaway evidence, run on 2026-10-18. The Worker lives in `apps/cas/spike/hd-worker`.
It runs under `wrangler dev` (wrangler 4.151.1, workers-rs 0.8.7, worker-build 0.8.7)
against the CAS dev Postgres (postgres:18 on :5434). It uses the monorepo's MemeBattle/sqlx
pin (`09ef6ac9`) and `vendor/sqlx-cloudflare-hd`, both unchanged.

**Verdict: yes.** sqlx's own Postgres driver works inside workerd over a local Hyperdrive
binding. `query!` from an offline cache works. So do a transaction on a bare `PgConnection`
and `sqlx::migrate!`. Nothing panicked. The Worker ran about 100 requests and two migration
runs. Production Hyperdrive was **not** tested.

## Answers

| Step | Question | Answer |
|---|---|---|
| 1 | Does the Worker build with the pin + vendored crate, no sqlx runtime? | **Yes.** It builds with `worker-build --release`. One catch: `cargo sqlx prepare` needs a runtime feature (see below). |
| 2 | Does the local Hyperdrive binding connect? | **Yes.** It uses `sqlx_cloudflare_hd::postgres::connect_with(&hd, &options)`. |
| 3a | `query!` from `.sqlx` with `SQLX_OFFLINE=true`? | **Yes** (`SELECT current_database(), $1::int4` → `cas 42`). |
| 3b | `begin`/`commit` on a bare `PgConnection`? | **Yes.** |
| 3c | `sqlx::migrate!` in a scratch schema, then drop it? | **Yes.** It ran twice: `applied=1`, then the schema was dropped. `public._sqlx_migrations` was left alone (still 13 rows) and `hd_spike` is gone. |
| 3d | Plaintext or `startTls` locally? | **Plaintext.** The local binding hands out `postgres://cas:…@<hash>.hyperdrive.local:5432/cas?sslmode=disable`. The vendored crate therefore opens the socket with `SecureTransport::Off` and sends no SSLRequest. If you force `ssl_mode(Require)`, it sends an SSLRequest and fails cleanly with "server does not support TLS", because the dev Postgres has no TLS. |
| 3e | What does the vendored crate do by default? | It follows the `sslmode` in the binding's connection string. `Disable`/`Allow` → `Off`. `Prefer` (sqlx's default when no sslmode is given) and stricter modes → `StartTls`, an SSLRequest, then `start_tls()` on `S`. With `Prefer`, an `N` reply falls back to plaintext. |
| 4a | Connect time through the binding | Median **8 ms**, p95 12 ms (30 requests per mode, local loopback). |
| 4b | Re-prepare on every request? | **Yes.** All 30 requests got a different `pg_backend_pid`, and each fresh connection starts with an empty statement cache. Every statement is Parsed again on every request. Within a request the cache works: 4 statements ran twice each and only 7 named statements were left for 7 distinct statements. |
| 4c | `persistent(false)` vs `statement_cache_capacity(0)` vs default | Within noise locally (table below). `capacity(0)` **leaks named statements** (see Findings). |
| 5a | `.wasm` size | 986 KB (wasm-opt from worker-build) / 1.73 MB before wasm-opt. `wrangler deploy --dry-run`: **1002 KiB total, 362 KiB gzip**. The limit is **64 MiB uncompressed** on both Free and Paid, with no compressed limit (Workers limits docs, via `cf docs search`). Startup limit: 1 s (not measured). |
| 5b | QueryLogger / `web-time` inside workerd | **No panic and no misbehaviour.** Elapsed times come out in whole milliseconds (e.g. `elapsed=6ms`). A statement whose reply was already buffered logs `elapsed=0ns`, because workerd's clock only moves across I/O. Slow-statement warnings still fired, with a 1 ms threshold. |

### Per-request timings (ms, 30 requests each, interleaved, after 3 warm-up requests)

Each request does the following:

- connect;
- one `query!`;
- 4 statements × 2;
- a transaction with 2 statements;
- a `pg_prepared_statements` count;
- close.

| Mode | connect median / p95 | queries median / p95 | tx median | total median / p95 | client median | named statements left at end |
|---|---|---|---|---|---|---|
| default (named, cache 100) | 8 / 12 | 10 / 15 | 4 | 25.5 / 33 | 28.2 | 7 |
| `persistent(false)` on runtime queries | 8 / 11 | 12 / 19 | 4 | 27 / 34 | 29.3 | 1 (the `query!`) |
| `statement_cache_capacity(0)` | 9 / 12 | 12 / 19 | 4 | 27 / 41 | 29.1 | **11** |

These are local loopback numbers with no Hyperdrive pool in the path: local dev connects
directly. Each extra round trip costs well under 1 ms here, so the prepare overhead does not
show. Against production Hyperdrive each round trip is a trip to the edge pool, and there the
difference is the thing to measure.

## Findings

1. **`cargo sqlx prepare` needs a runtime feature.** The online `query!` path panics with
   "one of the `runtime` features of SQLx must be enabled". The workaround is a feature used
   only for prepare (`prepare = ["sqlx/runtime-tokio"]`), run on the host target. The Worker
   build itself never enables it. CAS will need the same split.
2. **`statement_cache_capacity(0)` leaks named statements** (upstream sqlx behaviour, also in
   the fork). In `sqlx-postgres/src/connection/executor.rs`, `get_or_prepare` still allocates
   a named statement id for `persistent` queries. It then only inserts into the cache, and
   closes evicted statements, when the cache is enabled. So with capacity 0, every execution
   creates a new named statement that is never closed: 11 executions left 11 statements.
   Under Hyperdrive transaction pooling that is the worst option. Use `persistent(false)`
   instead.
3. **`query!` cannot be made non-persistent.** The macro returns `Map`, which has no
   `.persistent()`. The only global switch is the leaking `capacity(0)`. If production
   Hyperdrive rejects or mishandles sqlx's named statements, CAS needs one of these:
   - a sqlx change, e.g. an option to default `persistent` to false, or to use unnamed
     statements when the cache is off;
   - or no compile-time macros on the Worker path.
4. **`sqlx::migrate!` takes an advisory lock by default.** The Hyperdrive docs list advisory
   locks as unsupported. It worked locally only because local dev bypasses Hyperdrive. Through
   production Hyperdrive, either call `set_locking(false)` or, better, run migrations outside
   the Worker (CI/CLI over a direct connection). The run also used
   `dangerous_set_table_name("hd_spike._sqlx_migrations")` + `create_schema("hd_spike")`.
   That kept the bookkeeping out of CAS's `public._sqlx_migrations`.
5. **Path in the brief.** The vendored crate is `../../../../vendor/sqlx-cloudflare-hd` from
   `apps/cas/spike/hd-worker` (four levels, not three).
6. Nothing needed changing in `vendor/sqlx-cloudflare-hd` or the fork for this to work.
7. The root workspace did not need an `exclude`. The spike crate's own empty `[workspace]`
   table is enough, and `cargo metadata` at the root is clean.

## Snippets that worked

`Cargo.toml` (abridged; the full file is in the crate):

```toml
[workspace]

[lib]
crate-type = ["cdylib"]

[features]
# Only for `cargo sqlx prepare`.
prepare = ["sqlx/runtime-tokio"]

[dependencies]
sqlx-cloudflare-hd = { path = "../../../../vendor/sqlx-cloudflare-hd", features = ["postgres"] }
sqlx = { version = "0.9.0", default-features = false, features = ["postgres", "tls-none", "macros", "migrate", "uuid", "time", "json"] }
worker = "0.8.7"
getrandom = { version = "0.4", features = ["wasm_js"] }

[patch.crates-io]
sqlx = { git = "https://github.com/MemeBattle/sqlx", rev = "09ef6ac9470a13bad45c54df8f51d026d21e8625" }
sqlx-core = { git = "https://github.com/MemeBattle/sqlx", rev = "09ef6ac9470a13bad45c54df8f51d026d21e8625" }
sqlx-postgres = { git = "https://github.com/MemeBattle/sqlx", rev = "09ef6ac9470a13bad45c54df8f51d026d21e8625" }

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
```

`.cargo/config.toml`:

```toml
[target.wasm32-unknown-unknown]
rustflags = ['--cfg', 'getrandom_backend="wasm_js"']

[env]
SQLX_OFFLINE = "true"
```

`wrangler.toml`:

```toml
name = "hd-worker-spike"
main = "build/index.js"
compatibility_date = "2026-10-01"

[build]
command = "worker-build --release"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "00000000000000000000000000000000"  # placeholder, local dev only
localConnectionString = "postgres://cas:cas@localhost:5434/cas"
```

Connect call:

```rust
let hd = env.hyperdrive("HYPERDRIVE")?;
let options = sqlx_cloudflare_hd::postgres::options(&hd)?
    .log_statements(log::LevelFilter::Debug);
let mut conn = sqlx_cloudflare_hd::postgres::connect_with(&hd, &options).await?;
```

Reproduce:

```sh
cd apps/cas/spike/hd-worker
DATABASE_URL=postgres://cas:cas@localhost:5434/cas cargo sqlx prepare -- --features prepare
npx wrangler@4.151.1 dev --port 8799
curl 'http://127.0.0.1:8799/?mode=default'   # or nopersist, nocache, require, disable
curl http://127.0.0.1:8799/migrate
curl http://127.0.0.1:8799/info
```

## Not verified

- **Production Hyperdrive.** Nothing was created or deployed in the account. Still open:
  - what `sslmode` the production binding hands out, and whether `startTls` through it works;
  - whether sqlx's named statements (`sqlx_s_N`, Parse/Describe/Bind) survive transaction
    pooling; Hyperdrive documents named-statement support for the JS drivers only;
  - Hyperdrive's query cache in front of sqlx's extended protocol;
  - real connect latency through the edge pool, and its p95.
- Startup time and CPU time per request on the edge (Free plan: 10 ms CPU).
- `SET`/startup `options` (e.g. `search_path`) through Hyperdrive. The spike avoids them on
  purpose; the migration SQL qualifies the schema instead.
- Behaviour under concurrency in one isolate, and with more than 6 simultaneous outgoing
  connections per request.
