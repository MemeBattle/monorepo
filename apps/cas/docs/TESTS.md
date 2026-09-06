# Tests

Start the development database once, then run the CAS test suite with an explicit database URL:

```sh
cd apps/cas
docker compose up -d
DATABASE_URL=postgres://cas:cas@localhost:5434/cas cargo test
```

Repository tests use `#[sqlx::test]`, which requires `DATABASE_URL` in the environment. It does not read the monorepo `.env` files used by the application.

Each SQLx test receives a throwaway database with all migrations applied. Tests therefore do not share rows, and fixture teardown is unnecessary.

Handler tests that fail before any query (body validation, an unknown id
format) use a lazy pool that never connects, so they run without a database.

## Test support

Helpers shared by the library's tests and the server binary's tests live in
`cas::testing` (`src/testing.rs`). The module is compiled only with the
`test-support` feature, which the crate enables for its own tests through a
dev-dependency on itself; a normal build never includes it.

## The software authenticator

Tests that need a real credential run a full WebAuthn ceremony against
`SoftPasskey` from [webauthn-authenticator-rs](https://crates.io/crates/webauthn-authenticator-rs)
instead of hand-building a `Passkey`, so what is stored and verified is exactly
what the library produces. `cas::testing::soft_passkey_registration` answers a
challenge; `cas::testing::test_passkey` runs a whole ceremony.

It is constructed with `falsify_uv = true`: registration requires user
verification, which a software authenticator can only claim to have done.

Its version must move in lockstep with `webauthn-rs` — it pins the same
`webauthn-rs-core` and `webauthn-rs-proto`, and that is what makes the types
interchangeable between the two crates.
