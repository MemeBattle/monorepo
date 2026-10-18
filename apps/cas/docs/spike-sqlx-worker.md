# Spike: sqlx inside a Worker over Hyperdrive

Throwaway evidence, run on 2026-10-18. The Worker lives in `apps/cas/spike/hd-worker`.
It runs under `wrangler dev` (wrangler 4.151.1, workers-rs 0.8.7, worker-build 0.8.7)
against the CAS dev Postgres (postgres:18 on :5434). It uses the monorepo's MemeBattle/sqlx
pin (`09ef6ac9`) and `vendor/sqlx-cloudflare-hd`, both unchanged.

**Verdict: yes.** sqlx's own Postgres driver works inside workerd over a local Hyperdrive
binding. `query!` from an offline cache works. So do a transaction on a bare `PgConnection`
and `sqlx::migrate!`. Nothing panicked. The Worker ran about 100 requests and two migration
runs. Production Hyperdrive was **not** tested here; see "Production Hyperdrive (Tunnel)" at the end.

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

## Production Hyperdrive (Tunnel)

Run on 2026-10-18, through real Hyperdrive. The path was:

- the deployed Worker (`hd-worker-spike.<subdomain>.workers.dev`, colo BEG);
- Hyperdrive;
- Cloudflare Access (Service Auth);
- a Cloudflare Tunnel (`cloudflared` 2026.10.1 on the dev Mac, edges beg01/vie05);
- the CAS dev Postgres on :5434, given a self-signed certificate for the run.

**Every latency below includes the Tunnel hop to a laptop.** Treat them as an upper bound for
this topology, not as numbers for a managed database.

There were two Hyperdrive configs on the same origin:

- `cas-pg-spike`, query cache **disabled**;
- `cas-pg-spike-cached`, query cache **on**. On is Hyperdrive's default: a new config reports
  `caching.disabled = false`, and the CLI documents defaults of `max_age` 60 s and
  `stale_while_revalidate` 15 s.

The Worker binds both, as `HYPERDRIVE` and `HYPERDRIVE_CACHED` (`hd=cached` selects the second).

**Verdict: no, not with the fork as pinned (`09ef6ac9`).** 0 of 300 requests succeeded.
Two Hyperdrive protocol behaviours break sqlx's extended protocol:

- every `Close` message is rejected;
- a re-`Parse` of a statement name the pooled origin session already holds loses its
  `ParseComplete`.

A two-line experimental fork patch (below) plus `statement_cache_capacity(0)` made the uncached
config work: **30 of 30** requests. The query cache is unsafe for sqlx in every mode: it answered
reads with stale data and once made a `SELECT` re-run the previous `UPDATE`.

### Answers

| Question | Answer |
|---|---|
| `sslmode` in the production binding | **`disable`**. The binding hands out `postgresql://<id>:…@<hash>.hyperdrive.local:5432/<config-id>?sslmode=disable` (same shape for both configs). |
| `startTls` path taken? | **No.** `Disable` leads the vendored crate to `SecureTransport::Off`, with no SSLRequest. Forcing `ssl_mode(Require)` sends an SSLRequest; Hyperdrive answers `N` and the crate fails cleanly with "server does not support TLS" (30/30, ~1 ms). The Worker→Hyperdrive leg is in-runtime. Hyperdrive→origin is TLS: all 10 Hyperdrive backends showed `pg_stat_ssl.ssl = t`. |
| Stock fork (`09ef6ac9`): do sqlx queries work? | **No, 0/300** (30 per mode × 5 modes × 2 configs). sqlx sends `Close(Portal)` after every `Execute` (upstream sqlx 0.9.0 does the same). Hyperdrive replies `58000 Protocol Error: Unexpected protocol code: C` and drops the connection. Once a statement name has been prepared on a pooled origin connection, most requests fail earlier instead, with `expected ParseComplete, got ParameterDescription` (next row). Only `raw_sql` (simple protocol) works. |
| Named statements within a request | **Yes, when the name is fresh.** Raw probe: `P(s1) D S`, then `B(s1) E S` twice, returns `1 t T Z`, `2 D C Z`, `2 D C Z`. Patched sqlx in default mode succeeded 2/30, ending with 12–13 named statements in the session. |
| Named statements across requests | **No.** Hyperdrive isolates names correctly: a `Bind` to a name another client prepared fails (SQLSTATE 42P14). But when the pooled origin session already holds the same name and SQL, Hyperdrive swallows the `Parse` and omits `ParseComplete` if a `Describe` follows in the same Sync. It replies `t T Z` instead of `1 t T Z`. `P … S` without Describe still gets `1 Z`. sqlx numbers statements per connection (`sqlx_s_1`, `sqlx_s_2`, …) and every Worker request is a new connection, so the names collide on most requests. Patched default mode: 28/30 failed this way, as did `nopersist` (30/30; `query!` stays named). |
| Closing a named statement | **Impossible.** `Close(Statement)` is rejected like `Close(Portal)`. Named statements therefore pile up on Hyperdrive's origin connections: `pg_prepared_statements` showed 2–15 statements from other clients right after connect. |
| What works | **Unnamed extended protocol plus simple protocol, uncached config.** With the patch, `statement_cache_capacity(0)` prepares everything unnamed: 30/30 OK, results checked, the `query!` included. 5 distinct origin backend pids over 30 requests (pooling works). |
| `/migrate` | Stock: fails at the first `Close`. Patched: **works with the advisory lock on** (default mode 4 of 5 runs; one hit the `ParseComplete` bug), `run_ms` 844–885, and with `mode=nocache` (786 ms). With `set_locking(false)`: 571 ms. `pg_locks` held no advisory lock afterwards, and `hd_spike` was dropped each time. |
| `/info` | See the first row. Hyperdrive ports and hosts are per config. |
| Connect latency | Median **4 ms**, p95 7 ms (Hyperdrive accepts in the Worker's colo; the origin side is pooled). |
| Query latency | About **39 ms per round trip** through Hyperdrive → Tunnel → laptop. An unnamed query is 2 round trips (`P D S`, then `B E S`), so ~80 ms per query. |
| Wall-clock and CPU per request | Wall (handler, `x-wall-ms`): median 1037 ms / p95 1248 ms for the full exercise (~26 round trips). CPU (Workers Logs `$workers.cpuTimeMs`, n=27): **median 26 ms, p99 34 ms**. That is above the Free plan's 10 ms (requests were not killed). Failing requests used 3–4 ms. Not profiled; the Debug-level QueryLogger and console logging are suspects. |
| Cached config | **Unsafe for sqlx.** Simple-protocol reads were served from the cache, stale even right after the same connection's own `UPDATE`. On the extended protocol, Hyperdrive answers `Parse`+`Describe` of a cacheable SELECT itself. The following `Bind` then lands on whatever the origin session's unnamed statement is: either `26000 unnamed prepared statement does not exist`, or it **executes the previous statement**. A "read again" returned `C(UPDATE 1)` and bumped the counter a second time. Exercise through the cached config: 29/30 `incorrect binary data format in bind parameter 1`, 1/30 a wrong result for `SELECT $1::int8 + 1`. |

### Per-mode results (30 requests each, interleaved)

Patched fork; the stock fork failed every request (see above).

| Config | Mode | OK | connect med / p95 | queries med / p95 | tx med | total med / p95 | client med / p95 | CPU med / p99 |
|---|---|---|---|---|---|---|---|---|
| uncached | nocache (all unnamed) | **30/30** | 4 / 7 | 746 / 916 | 233 | 1037 / 1248 | 1082 / 1297 | 26 / 34 |
| uncached | default (named) | 2/30 | 4.5 / 5 | 724 / 736 | 286 | 1055 / 1071 | – | 4 / 35 |
| uncached | nopersist | 0/30 | – | – | – | – | – | 4 / 7 |
| uncached | disable | 0/30 (= default; the binding is already `disable`) | – | – | – | – | – | 4 / 10 |
| uncached | require | 0/30 (no TLS on the Worker leg) | – | – | – | – | – | 1 / 3 |
| cached | all five modes | 0/30 each | – | – | – | – | – | ≤ 6 / 19 |

All times are in ms.

### What would have to change

- **Fork (MemeBattle/sqlx)**, two things to upstream or carry:
  1. Make the `Close(Portal)` after `Execute` optional, or drop it. The unnamed portal dies at
     the next `Bind`/Sync anyway.
  2. When the statement cache is off, or a query is non-persistent, prepare **unnamed** and never
     send `Close(Statement)`. This also fixes the `statement_cache_capacity(0)` leak from the
     first run.

  The experimental patch used for the numbers above (`sqlx-postgres/src/connection/executor.rs`,
  applied to a scratch copy and wired in through a spike-only `[patch]` path, never committed):

  ```diff
  @@ get_or_prepare
  +        // a statement nobody caches is never reused, so do not name it.
  +        let persistent = persistent && self.inner.cache_statement.is_enabled();
           let statement = prepare(
  @@ run
  -            self.inner
  -                .stream
  -                .write_msg(Close::Portal(PortalId::UNNAMED))?;
  ```

  Optional: pipeline unnamed `Parse`/`Bind`/`Execute` into one Sync. That would halve the round
  trips per query, ~40 ms each here.
- **Vendored crate (`sqlx-cloudflare-hd`)**: nothing is required. It could default
  `statement_cache_capacity(0)` in `options()`, since named statements cannot work through
  Hyperdrive.
- **CAS**:
  - create its Hyperdrive config with caching **disabled**;
  - connect with `statement_cache_capacity(0)` (on the patched fork);
  - keep `query!`, which works unnamed with that setting;
  - budget round trips;
  - expect the Paid plan's CPU limit unless profiling brings 26 ms down;
  - migrations through Hyperdrive ran with and without the advisory lock, but whether the lock
    excludes concurrent migrators through Hyperdrive is unverified; run them outside the Worker.

### Commands (secrets redacted)

```sh
# Zone (kept): <zone-id>, ns angela/drake.ns.cloudflare.com
cf zones create --account-id <account> --name themezv.ru --type full

# Origin TLS for the run: self-signed cert + a compose override outside git
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -keyout server.key -out server.crt
docker compose -p cas -f docker-compose.yml -f <scratch>/docker-compose.tls.override.yml up -d
#   (the override copies the key into the container as postgres:0600 and runs
#    `postgres -c ssl=on -c ssl_cert_file=… -c ssl_key_file=…`)

# Tunnel (remotely managed, so no `cloudflared tunnel login`)
cf tunnels create --name cas-pg-spike --config-source cloudflare
cf tunnels config update <tunnel-id> --body '{"config":{"ingress":[{"hostname":"pg-spike.themezv.ru","service":"tcp://localhost:5434"},{"service":"http_status:404"}]}}'
cf dns records create --zone <zone-id> --body '{"type":"CNAME","name":"pg-spike","content":"<tunnel-id>.cfargotunnel.com","proxied":true}'
cf tunnels token get <tunnel-id> > <scratch>/secrets/tunnel-token.raw
TUNNEL_TOKEN=<redacted> cloudflared tunnel --no-autoupdate run

# Access: service token + self-hosted app with a Service Auth (non_identity) policy
cf zero-trust access service-tokens create --name hyperdrive-cas-pg-spike --duration forever
cf zero-trust access applications create --body '{"type":"self_hosted","name":"cas-pg-spike","domain":"pg-spike.themezv.ru","session_duration":"0s","app_launcher_visible":false,"allowed_idps":[],"auto_redirect_to_identity":false,"policies":[{"name":"hyperdrive-service-auth","decision":"non_identity","include":[{"service_token":{"token_id":"<service-token-id>"}}]}]}'

# Hyperdrive: no port (the Access flags exclude it); `cf hyperdrive create` has no
# caching flag, so caching is disabled with `update` and checked with `get`
cf hyperdrive create --name cas-pg-spike --origin-scheme postgres --origin-host pg-spike.themezv.ru \
  --origin-database cas --origin-user cas --origin-password <redacted> \
  --origin-access-client-id <redacted> --origin-access-client-secret <redacted>
cf hyperdrive update <id> --caching-disabled
cf hyperdrive get <id>                       # caching: {"disabled": true}
cf hyperdrive create --name cas-pg-spike-cached …   # same flags, caching left on

# Worker: wrangler is not logged in, so deploy with cf. That needs a declared dev server
# (package.json with wrangler 4.151.1) and `cf migrate`, which writes cloudflare.config.ts
# and wrangler.config.ts (TODO guard removed by hand; `cf@1.0.0-beta.18` installed).
# `cloudflare-rs-dev-server`, the Rust option cf suggests, is not on crates.io.
# Exception: cf@1.0.0-beta.18 (published 2026-10-16) is younger than the repository's
# one-week minimumReleaseAge. The spike's npm lockfile sits outside the pnpm workspace, so
# the policy did not apply mechanically; it is a documented exception for throwaway tooling.
cd apps/cas/spike/hd-worker
cf migrate wrangler.toml --no-install --force && npm install --save-dev --save-exact cf@1.0.0-beta.18
cf deploy

# Load: <scratch>/bench.sh (30 × 5 modes × 2 configs); CPU from Workers Logs:
cf o11y telemetry query --body '{"queryId":"…","timeframe":{…},"view":"calculations","parameters":{"datasets":["cloudflare-workers"],"filters":[{"key":"$metadata.service","operation":"eq","type":"string","value":"hd-worker-spike"}],"calculations":[{"operator":"median","key":"$workers.cpuTimeMs","keyType":"number","alias":"cpu_p50"}],"groupBys":[{"type":"string","value":"$workers.event.request.url"}]}}'
```

### Teardown (each confirmed with a list command)

| Resource | Command | Confirmation |
|---|---|---|
| Worker `hd-worker-spike` | `cf workers delete <id> --force` | `cf workers list` → `[]` |
| Hyperdrive `cas-pg-spike`, `cas-pg-spike-cached` | `cf hyperdrive delete <id> --force` ×2 | `cf hyperdrive list` → `[]` |
| Access app `cas-pg-spike` | `cf zero-trust access applications delete <id> --force` | `… applications list` → `[]` |
| Service token | `cf zero-trust access service-tokens delete <id> --force` | `… service-tokens list` → `[]` |
| DNS `pg-spike.themezv.ru` | `cf dns records delete <id> --zone <zone> --force` | `cf dns records list` → `[]` |
| Tunnel `cas-pg-spike` | `cloudflared` stopped, then `cf tunnels delete <id> --force` | `deleted_at` set; no live tunnels in `cf tunnels list` |
| Dev Postgres | `DROP SCHEMA hd_cache`, then `docker compose -p cas -f docker-compose.yml up -d` | entrypoint `postgres`, `SHOW ssl` → `off`; `cargo test -p cas` passes (656 + 10 + 4) |

The zone `themezv.ru` stays. `wrangler.toml` and `cloudflare.config.ts` are back to placeholder
ids; the spike's `[patch]` is back on the fork rev. The spent tunnel and service-token secrets
were deleted from the scratch directory.

## Committed fork re-run

Run on 2026-10-18, after the protocol patch landed in the fork as proper commits. The
topology was the same as in the previous section: Worker (colo BEG) → Hyperdrive → Access →
Tunnel (`cloudflared` 2026.10.1, edges beg01/vie05/vie06) → the dev Postgres with TLS.
There was one difference: only the **uncached** config `cas-pg-spike` was created, and the
spike's two bindings both pointed at it. The cached config was not re-tested, and the query
cache stays incompatible.

The spike's own `[patch.crates-io]` pins MemeBattle/sqlx `6678c9a3`, tag
`v0.9.0-memebattle.2`, branch `memebattle/v0.9.0-hyperdrive`. No scratch copy and no
uncommitted patch were used. The fork adds three commits on top of `09ef6ac9`:

1. `06860a39`: no `Close(Portal)` after `Execute`. The unnamed portal is destroyed by the next
   `Bind` or the end of the transaction. This changes the default path too, by one message
   fewer per query.
2. `8a5804f6`: parse the unnamed statement again if a simple Query dropped it. sqlx resolves
   unknown types with `raw_sql`, and a simple Query destroys the unnamed statement. Upstream
   0.9.0 fails with SQLSTATE 26000 on `.persistent(false)` the first time a connection meets a
   user-defined type. The fix re-sends `Parse` in front of the `Bind`, in the same Sync.
3. `6678c9a3`: with `statement_cache_capacity(0)`, `run` and `prepare` use the unnamed
   statement. `describe` stays named, because it needs one for `EXPLAIN EXECUTE`. With the
   cache enabled, nothing changes on the wire.

The optional pipelining of `Parse`/`Bind`/`Execute` into one Sync was not done. The type
resolution that can run between `Parse` and `Bind` makes it more than a small change.

sqlx's own tests passed: the Postgres suite in the form sqlx CI uses (PG 17 from
`tests/docker-compose.yml`, `runtime-tokio`, `tls-none`, `-D warnings`, including the
isolated `test_pg_copy_chunked` and `rustsec_2024_0363`), plus `cargo test -p sqlx-core --lib`.
New tests cover two cases. With capacity 0, nothing is left in `pg_prepared_statements`. The
unnamed statement survives type resolution with `persistent(false)` and with capacity 0.

**Verdict: yes, with `statement_cache_capacity(0)` and caching disabled.** All 30 of 30
`nocache` requests succeeded, `query!` included, with no scratch patch. Named modes still fail,
as expected.

### Per-mode results (30 requests each, interleaved, after one warm-up round)

| Mode | OK | connect med / p95 | queries med / p95 | tx med | total med / p95 | client med / p95 | CPU med / p99 |
|---|---|---|---|---|---|---|---|
| nocache (all unnamed) | **30/30** | 3 / 4 | 670 / 769 | 209 | 916 / 1040 | 968 / 1088 | **16 / 20** |
| default (named, cache 100) | 1/30 | 4 | 601 | 223 | 866 | 918 | 2 / 17 |
| nopersist (`query!` stays named) | 1/30 | 17 | 763 | 237 | 1054 | 1094 | 3 / 21 |

All times are in ms. CPU comes from Workers Logs (`$workers.cpuTimeMs`, grouped by URL,
n = 29–31 including warm-up). The handler's own `total_ms` equals `x-wall-ms`.

- **No `Close` reaches Hyperdrive any more.** Every failure (58/58) was
  `at query! (named, $1::int4): expected ParseComplete, got ParameterDescription`. That is the
  cross-request name collision on pooled origin sessions, and it is why named statements cannot
  work through Hyperdrive.
- **`nocache` leaves nothing behind.** `named_statements − statements_at_connect` was 0 on all
  30 requests. The 1 or 7 statements found at connect were left by the failing named modes on
  the shared origin sessions. 5 distinct origin backend pids over 30 requests showed that pooling
  works.
- **Latency** is about the same as the patched run before it (total median 916 ms vs 1037 ms).
  It is still dominated by ~40 ms round trips through the Tunnel to a laptop, and an unnamed
  query still takes 2 round trips.
- **CPU per request dropped to median 16 ms, p99 20 ms**, down from 26 / 34 ms. The workload
  and the logging were the same, so the variance is unexplained. The figure is still above the
  Free plan's 10 ms.

### `/migrate` and `/info`

| Call | Result |
|---|---|
| `/migrate?mode=nocache` (advisory lock on) | OK twice: `applied=1`, `run_ms` 799 and 732, `hd_spike` dropped |
| `/migrate?mode=nocache&nolock=1` | OK: `run_ms` 480 |
| `/migrate?mode=default` | OK once (`run_ms` 834). Named mode can still hit the collision. |
| afterwards | `hd_spike` gone, no advisory locks in `pg_locks`, `public._sqlx_migrations` still 15 rows |
| `/info` | `sslmode=disable`, `parsed_ssl_mode=Disable`, `start_tls_path=false` (unchanged). Hyperdrive → origin over TLS: 5 of the `cas` client backends had `pg_stat_ssl.ssl = t`. The one with `f` was the local `psql` probe. |

### What remains

- **Hyperdrive's query cache must stay disabled** for every config sqlx talks to.
- **Connect with `statement_cache_capacity(0)`.** `vendor/sqlx-cloudflare-hd` does not set it
  (see its `VENDOR.md`). Defaulting it in `options()` would be a change to the vendored source.
- **CPU per request** is 16–20 ms for ~26 round trips. That needs the Paid plan, or profiling:
  the Debug-level QueryLogger and console logging are still suspects.
- **Migrations** executed successfully with locking enabled and disabled. sqlx's migrator
  takes a session-level `pg_advisory_lock`, and Hyperdrive lists advisory locks as unsupported
  under transaction pooling. Sequential runs with no leftover locks do not prove mutual
  exclusion between concurrent migrators, so locking correctness through Hyperdrive is
  unverified. Migrations should run outside the Worker, over a direct connection.

### Teardown (each confirmed with a list command)

| Resource | Command | Confirmation |
|---|---|---|
| Worker `hd-worker-spike` | `cf workers delete <id> --force` | `cf workers list` → `[]` |
| Hyperdrive `cas-pg-spike` | `cf hyperdrive delete <id> --force` | `cf hyperdrive list` → `[]` |
| Access app `cas-pg-spike` | `cf zero-trust access applications delete <id> --force` | `… applications list` → `[]` |
| Service token | `cf zero-trust access service-tokens delete <id> --force` | `… service-tokens list` → `[]` |
| DNS `pg-spike.themezv.ru` | `cf dns records delete <id> --zone <zone> --force` | `cf dns records list` → `[]` |
| Tunnel `cas-pg-spike` | `cloudflared` stopped, then `cf tunnels delete <id> --force` | `deleted_at` set; `cf tunnels list --is-deleted false` → `[]` |
| Dev Postgres | `docker compose -p cas -f docker-compose.yml up -d` | entrypoint `postgres`, `SHOW ssl` → `off`; `cargo test -p cas` passes (663 + 10 + 4) |

The zone `themezv.ru` stays. `wrangler.toml` and `cloudflare.config.ts` are back to placeholder
ids. The tunnel token and service-token secrets were deleted from the scratch directory.
