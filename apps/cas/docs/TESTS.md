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

Test queries use the unchecked `sqlx::query*` functions rather than the
compile-time-checked macros, because CI runs the tests with `SQLX_OFFLINE=true`
and `cargo sqlx prepare` does not cache queries from the test target; the
comment `// Unchecked query: see docs/TESTS.md.` marks them.

## Test support

Helpers shared by all of the crate's tests live in `src/testing.rs`. The module
is compiled only for `cfg(test)`, so a normal build never includes it.

## The software authenticator

Tests that need credentials use `ResidentSoftPasskey` in `src/testing.rs`.
It adds RP-scoped resident storage, credential discovery and user handles on
top of [webauthn-authenticator-rs](https://crates.io/crates/webauthn-authenticator-rs)'s
`SoftPasskey`, which performs real key generation, attestation and signatures.
Upstream `SoftPasskey` cannot create resident credentials. Only the test
adapter clears the resident-key requirement when delegating to that signer;
it stores and discovers the resulting credential itself. Production options
are never downgraded. This is an in-process emulator, not a browser or hardware
compatibility test.

`crate::testing::soft_passkey_registration` answers a challenge;
`crate::testing::test_passkey` runs a whole ceremony using the same registration
policy as production. A service test keeps the emulator alive across registration
and usernameless authentication: the authentication request has no allowed
credential IDs, and the assertion is verified against the passkey loaded from
Postgres. Another test confirms that unwrapped `SoftPasskey` rejects the
production request because resident storage is required.

The signer uses `falsify_uv = true`: the test simulates successful user
verification. The verifier still checks the UV flag, challenge, origin and
signature. Browser UI, actual biometrics/PIN and synced-provider behaviour
remain manual or browser-integration checks.

Its version must move in lockstep with `webauthn-rs` and `webauthn-rs-proto`.
The `conditional-ui` feature is enabled only as a dev dependency for the
usernameless authentication test; login endpoints remain the scope of #666.
