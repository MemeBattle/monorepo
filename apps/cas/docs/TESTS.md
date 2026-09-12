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

`capture_tracing` collects everything `tracing` emits on the calling thread,
one string per event and one per span with every field rendered, so a test
can assert what was logged and — the reason it exists (ADR 0004) — that a
secret was not. Spans are included because the production formatter prints
an event together with the fields of the spans around it: a request span
carrying a header would put it on every line of that request. Bind its
guard (`let (events, _guard) = capture_tracing();`) or the capture is dropped
before the code under test runs. It also installs a global subscriber that
keeps nothing, once per process: `tracing` caches per callsite whether a line
is worth evaluating and computes that from the global subscriber, so without
one a line first reached by another test's thread would be written off as
disabled for the whole binary.

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

`crate::testing::soft_passkey_registration` answers a registration challenge;
`crate::testing::test_passkey` runs a whole ceremony using the same registration
policy as production. Login tests need the emulator that answered the
registration, because it is the one holding the private key:
`crate::testing::register_soft_passkey` registers an account through the
service and hands the emulator back, and `crate::testing::soft_passkey_assertion`
answers a login challenge with it. The login request has no allowed credential
IDs, and the assertion is verified against the passkey loaded from Postgres.
Another test confirms that unwrapped `SoftPasskey` rejects the production
registration request because resident storage is required.

The emulator keeps a real signature counter, so the tests that check the
counter advancing, and a login being refused when it does not, exercise the
library's own check rather than a stub.

The signer uses `falsify_uv = true`: the test simulates successful user
verification. The verifier still checks the UV flag, challenge, origin and
signature. Browser UI, actual biometrics/PIN and synced-provider behaviour
remain manual or browser-integration checks.

Its version must move in lockstep with `webauthn-rs` and `webauthn-rs-proto`.
