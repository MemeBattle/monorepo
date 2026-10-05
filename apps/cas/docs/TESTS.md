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

## The OpenAPI description

Every answer a transport test gets is also checked against the OpenAPI
description (ADR 0016 (f)). `http::app` carries the check in test builds,
and a context's tests build their router with `testing::checked(router(…))`,
which applies the same check against that router's own description. The
check fails the test when a response has a status its operation does not
declare, carries an error code the status does not list, or answers a route
the description does not have (only 404, 405 and the CSRF line's 403 may
answer those). The fix is to declare the response — add the extractor's
marker or the domain error to the handler's `error_set!` — never to exempt it.

The description is committed as `apps/cas/openapi.json` and the test
`the_committed_document_is_current` compares it with what `GET /openapi.json`
serves. After changing the API, regenerate it and commit the file:

```sh
cd apps/cas
UPDATE_OPENAPI=1 cargo test --lib the_committed_document_is_current
```

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

Tests that need credentials use `ResidentSoftPasskey`, which lives in
`src/testing/soft_passkey.rs` and is re-exported from `src/testing.rs`.
It adds RP-scoped resident storage, credential discovery and user handles on
top of [webauthn-authenticator-rs](https://crates.io/crates/webauthn-authenticator-rs)'s
`SoftPasskey`, which performs real key generation, attestation and signatures.
Upstream `SoftPasskey` cannot create resident credentials. Only the test
adapter clears the resident-key requirement when delegating to that signer;
it stores and discovers the resulting credential itself. Production options
are never downgraded. This is an in-process emulator, not a browser or hardware
compatibility test.

The adapter also honours `excludeCredentials`, which `SoftPasskey` ignores:
asked to register when it already holds a credential the challenge
excludes for that relying party, it answers `Ctap2CredentialExcluded`, the
way a CTAP2 authenticator does. The passkey addition tests rely on that to
show a registered device refusing the challenge that adds a passkey.

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

The file is shared with [the reference client](#the-reference-client)
through `#[path]`, so one emulator answers every ceremony of both targets
rather than a second copy that could drift. An integration test links the
library built without `cfg(test)` and cannot reach `crate::testing`, so the
file must stay free of `crate::` paths and depend only on the WebAuthn
crates. Sharing it this way, rather than through a cargo feature, keeps
`webauthn-authenticator-rs` out of the production dependencies.

## The reference client

`tests/reference_client` is a black-box OpenID Connect relying party: proof
that an ordinary client can integrate knowing only the issuer and its own
registration. Each test serves the real `cas::http::app` on a TCP port of its
own, against its own `#[sqlx::test]` database, and drives it over HTTP: the
relying party with the `openidconnect` crate and its reqwest client, the
user's browser with a plain HTTP client and the software authenticator. It
covers sign-in, the code exchange, ID and access token verification against
the published key set, userinfo, refresh, RP-initiated logout, the guest
grant and the guest upgrade.

Run it alone:

```sh
cd apps/cas
DATABASE_URL=postgres://cas:cas@localhost:5434/cas cargo test --test reference_client
```

Everything OIDC comes from the discovery document: the relying party is
configured by the library's own discovery, so every endpoint it calls and
every algorithm it accepts is the document's. The only hard-coded paths are
CAS's own `/api`, where the test plays the frontend. The other direction is
guarded too: a member or a value added to the discovery document fails
`the_discovery_document_is_what_the_reference_client_exercises` until the
reference client exercises it and the test lists it.

It lives outside the crate on purpose, because it may use only what a relying
party has; `testing.rs` and everything else that is `cfg(test)` is out of its
reach. That includes the OpenAPI conformance check of
[the OpenAPI description](#the-openapi-description): the library under the
reference client is built without it.
