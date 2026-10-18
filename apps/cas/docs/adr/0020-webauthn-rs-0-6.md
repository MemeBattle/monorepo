# 20. webauthn-rs 0.6 through a MemeBattle fork

## Status

Accepted (2026-10-18). Completes what ADR 0019 left open: OpenSSL is no
longer anywhere in the dependency tree. Nothing on the wire and nothing
stored changes, with the behavioural differences listed under Consequences.

## Context

CAS is being prepared to run on Cloudflare Workers, which builds for
`wasm32-unknown-unknown`. After ADR 0019 the last OpenSSL in the tree came
through webauthn-rs 0.5.5 (`webauthn-rs-core`, `webauthn-attestation-ca`),
and the `openssl` crate does not build there.

webauthn-rs 0.6.1-dev, published to crates.io from upstream's
`6.0-dev-drop-openssl` branch, replaces OpenSSL with RustCrypto
(`crypto-glue`) and compiles for wasm32. It still has one runtime problem
there: `webauthn-rs-core` reads `std::time::SystemTime::now()` when a
registration finishes and in `Credential::verify_attestation`, and std's
clock panics on `wasm32-unknown-unknown`. Authentication does not read the
clock.

What CAS stores through the library is its serde form, under
`danger-allow-state-serialisation` (ADR 0001, ADR 0002): the passkey in
`passkey_credentials.credential`, ceremony state in
`webauthn_ceremonies.state`. Passkeys are kept forever, so a version that
cannot read what the previous one wrote would lock users out.

## Decision

**(a) webauthn-rs 0.6.1-dev, from a MemeBattle fork pinned by full rev.**
[`MemeBattle/webauthn-rs`](https://github.com/MemeBattle/webauthn-rs), tag
`v0.6.1-dev-memebattle.2` (branch `memebattle/v0.6.1-dev-wasm-clock`), is
upstream commit `8a80623a` (the one crates.io's 0.6.1-dev crates name in
their `.cargo_vcs_info.json`; their sources match it file for file) plus two
commits. In the first, `webauthn-rs-core` reads the clock through the
`web-time` crate, which re-exports std's clock everywhere except wasm32,
where it reads `Date.now()`. The second adds
`WebauthnBuilder::algorithms`, for (b); the library's default is unchanged. The root `Cargo.toml` patches `webauthn-rs`,
`webauthn-rs-core`, `webauthn-rs-proto`, `webauthn-attestation-ca` and
`webauthn-authenticator-rs` (dev only) to that rev, the way it patches sqlx:
the crates pin each other exactly, so they come from one source together.
The tag messages carry a patch description for each commit, ready for
upstream PRs.

**(b) The API stays what it was.** 0.6's default credential algorithms
(`COSEAlgorithm::secure_algs()`) add ES384 to 0.5's ES256 and RS256, and
0.5 cannot verify an ES384 credential. CAS therefore sets its own list,
`webauthn::CREDENTIAL_ALGORITHMS`: `pubKeyCredParams` stays exactly
`[-7, -257]` in that order, and a test holds it. The algorithms are part of
CAS's wire contract, not the library's to change. 0.6 made `CredentialID` a
bare `Vec<u8>`,
which serialises as an array of numbers. The `credentialId` of
`/verify-registration` and `/verify-login` is therefore written by CAS
itself, base64url without padding, as before; the OpenAPI document is
byte-identical. The stored `credential_id` column is the same raw bytes.
The other changes are in tests only: `Base64UrlSafeData` left the prelude,
user handles are `Vec<u8>`, and `WebauthnAuthenticator` became a trait that
every authenticator backend implements.

**(c) Stored data is compatible both ways, and a test holds it so.**
Fixtures written by 0.5.5, before the bump, are checked in under
`src/webauthn/testdata/`: a passkey of a fixed test key (`none`
attestation), a passkey of the software authenticator (packed
self-attestation, `credProps`), and unfinished registration, passkey
addition (with `excludeCredentials`) and login ceremonies. Under 0.6 every
one of them loads and is written back as exactly the same JSON, the stored
passkey signs in (twice, the second time from the row 0.6 rewrote), and each
stored ceremony finishes. Since 0.6 writes what 0.5 wrote, a rolling deploy
needs nothing, and a rollback finds no row it cannot read. No migration.

## Consequences

- `cargo tree -i openssl` is empty; nothing in the lock links OpenSSL.
- The WebAuthn ceremonies no longer read std's clock, so they can run on
  wasm32. CAS as a whole does not build for wasm32 yet: the first error is
  getrandom 0.2 (through `crypto-glue`) without its `js` feature, and the
  database layer, tokio's features and the entrypoint follow.
- CAS depends on a `-dev` release of webauthn-rs plus a patch. The fork is
  rotated away when upstream releases 0.6: if the release contains the clock
  fix, or another way not to read std's clock on wasm32 (passing the time
  in), the `[patch.crates-io]` entries are deleted and the versions bumped;
  otherwise the patch is rebased onto the release tag as
  `v<version>-memebattle.1`. Either way, a new set of stored-data fixtures
  is captured under the version being left before the bump, as here.
- A later upgrade keeps these 0.5.5 fixtures: a passkey written by 0.5.5
  must load for as long as any are stored.
- Known behavioural difference: the hash used to check an EC signature. 0.5
  verified an ES256 (`-7`) credential with SHA-256 whatever its curve. 0.6
  picks the hash from the key's curve: SHA-384 for P-384, and P-521 is
  refused. So a credential stored as ES256 with a P-384 key would stop
  signing in. CAS has only ever offered ES256 and RS256, and an ES256 key is
  P-256, so no conforming authenticator produced one, and CAS had no
  production credentials before this change. The stored-data tests cover
  P-256 keys only.
- Known gap, unfixed: crypto-glue 0.1.15, which webauthn-rs 0.6.1-dev pulls,
  cannot verify a signature made with an RSA attestation certificate. It
  matches the certificate's `rsaEncryption` key against
  `sha256WithRSAEncryption` and fails with `SignatureAlgorithmNotImplemented`,
  so a registration carrying such a statement (a TPM or packed one with an
  RSA x5c) is refused. crypto-glue 0.1.18 fixes the match, but 0.1.16–0.1.18
  pin `digest = "=0.11.0-rc.12"`, which cannot share the lock with the
  `digest` 0.11 that sqlx and `sha2` need. CAS asks for no attestation
  (`attestation: none`), and browsers then send a `none` statement, so this
  is not expected in practice.
