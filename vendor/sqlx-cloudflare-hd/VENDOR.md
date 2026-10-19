# Vendored: sqlx-cloudflare-hd

| | |
|---|---|
| Source repository | https://github.com/sqlx-contrib/sqlx-cloudflare |
| Pull request | [sqlx-contrib/sqlx-cloudflare#16](https://github.com/sqlx-contrib/sqlx-cloudflare/pull/16) (draft, unmerged) |
| Branch | `feat/sqlx-cloudflare-hd` |
| Commit | `9499455dc20b793128f76bc7b675bc0b2118e5d8` |
| Path in source | `crates/sqlx-cloudflare-hd` |
| Fetched | 2026-10-18 |
| License | MIT (`LICENSE`, copied verbatim from the source repository root) |

The crate is unpublished upstream (`publish = false`), so it is copied here
rather than taken from crates.io. It needs `PgConnection::connect_with_socket`
and a wasm-safe `Instant` from sqlx; this workspace gets both from the
MemeBattle/sqlx fork through the root `[patch.crates-io]` (upstream pins
`iamralch/sqlx` at `4313dae17eb0d985e905022fe5e9ab862ec14e86`, which carries
the same two commits on top of unreleased sqlx main).

## Using it through Hyperdrive

Production Hyperdrive rejects every `Close` message and cannot keep sqlx's
named prepared statements apart across Worker requests (each request is a new
client connection on top of pooled origin sessions). Two settings are
required, neither of which this crate sets:

- connect with `statement_cache_capacity(0)` on the options from `options()`,
  so the MemeBattle/sqlx fork (`v0.9.0-memebattle.2` or later) prepares every
  statement, `query!` included, as the unnamed statement;
- create the Hyperdrive config with its query cache **disabled**
  (`cf hyperdrive update <id> --caching-disabled`); the cache answers sqlx's
  extended-protocol `Parse`/`Describe` itself and the following `Bind` lands on
  the wrong statement.

```rust
let options = sqlx_cloudflare_hd::postgres::options(&hd)?.statement_cache_capacity(0);
let mut conn = sqlx_cloudflare_hd::postgres::connect_with(&hd, &options).await?;
```

Evidence: `apps/cas/docs/spike-sqlx-worker.md` ("Production Hyperdrive
(Tunnel)" and "Committed fork re-run").

## Files

Copied verbatim, byte for byte:

- `README.md`
- `LICENSE` (from the repository root)
- `tests/driver.rs`

Changed here (see Changes):

- `src/lib.rs`
- `src/postgres.rs`
- `src/socket.rs`

Added here:

- `src/abort.rs`

Not copied: `tests/worker/` (the test Worker, built separately with
`worker-build` and `wrangler`). `tests/driver.rs` skips itself unless
`HD_WORKER_URL` points at a running instance of that Worker; the
`make test-worker` target it mentions lives in the source repository, not here.

## Changes

- `Cargo.toml` rewritten as a standalone crate. Upstream inherits from its
  workspace manifest; the inherited values are spelled out instead:
  - `edition = "2021"`, `rust-version = "1.94"`, `license = "MIT"`,
    `repository = "https://github.com/sqlx-contrib/sqlx-cloudflare"`;
  - `[lints]` copied from upstream's `[workspace.lints]` (clippy `all` and
    `pedantic` denied, `missing_docs` denied);
  - dependency versions and features copied from upstream's
    `[workspace.dependencies]`: `sqlx-core` and `sqlx-postgres` `0.9.0` with
    `default-features = false, features = ["offline"]`, `worker` `0.8.6` with
    `default-features = false`, `tokio` `1` with `default-features = false`;
    dev-dependencies `sqlx` `0.9.0` (`postgres`, `macros`), `ureq` `3`
    (`default-features = false`), `serde_json` `1`;
  - the `postgres` feature is unchanged (`["dep:sqlx-postgres", "dep:tokio"]`,
    nothing on by default);
  - the wasm32 `getrandom = { version = "0.4", features = ["wasm_js"] }`
    dependency is upstream's own, kept as is;
  - dropped `exclude = ["tests/worker"]` (the directory is not vendored) and
    upstream's `[patch.crates-io]` (lives in the root `Cargo.toml` here);
  - comments shortened to what applies in this workspace.
- `VENDOR.md` added (this file).
- **`SocketAbort`**, a handle that forcibly closes a connection's socket from
  outside the future that owns it (`src/abort.rs`, exported from `src/lib.rs`;
  `postgres::connect_with_abort` next to the unchanged `connect_with`;
  `HdSocket` opens through `worker_sys::connect` and keeps the raw JS socket so
  the handle can follow the `startTls()` swap).

  Why: nothing on this stack closes a socket on drop — sqlx sends `Terminate`
  and shuts the stream down only inside `Connection::close`, and neither
  `worker::Socket` nor `HdSocket` has a socket-closing `Drop` — and Cloudflare
  documents no cleanup of unclosed sockets when an invocation ends, only the
  explicit [`Socket.close()`][close] as the forcible close of both streams. A
  caller that raced the connect against a deadline, or whose request is simply
  over, therefore has no way to close the socket without this. CAS's Worker
  entrypoint needs it on both paths (`apps/cas/docs/adr/0022-worker-entrypoint.md`,
  (c)).

  This diverges from upstream PR #16, which has none of it. `connect_with`
  keeps its upstream signature and delegates with a throwaway handle, so a
  re-sync only has to carry `abort.rs` and the connect plumbing.

[close]: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#close-tcp-connections
