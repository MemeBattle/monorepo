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

## Files

Copied verbatim, byte for byte:

- `README.md`
- `LICENSE` (from the repository root)
- `src/lib.rs`
- `src/postgres.rs`
- `src/socket.rs`
- `tests/driver.rs`

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

No source file was changed.
