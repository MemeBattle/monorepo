# 19. Signing on RustCrypto instead of OpenSSL

## Status

Accepted (2026-10-18). Amends ADR 0009 (a) and (g), and ADR 0013 (a): the
signing key is read, and tokens are signed and verified, with the `p256`
crate rather than OpenSSL. Nothing on the wire changes.

## Context

ADR 0009 (g) put signing on OpenSSL because it was already linked through
`webauthn-rs`. CAS is being prepared to run on Cloudflare Workers, which
builds for `wasm32-unknown-unknown`, and the `openssl` crate does not build
there: it binds the C library. `src/oidc/keys.rs` was CAS's only direct use
of it.

What had to hold across the change: every token signed before it verifies
after it against the same JWKS, and the other way round; the JWK and its
`kid` stay what they were for the same key; and every key that was refused
at startup is still refused, with the same message.

## Decision

**(a) ES256 on `p256` (RustCrypto), the key decoded with `pkcs8` and
`sec1`.** All three were already in the lock through `webauthn-rs`. The PEM
framing stays CAS's own, as before; the base64 inside a block is decoded at
any line width, as OpenSSL reads it. PKCS#8 must name `id-ecPublicKey` on
P-256; a bare SEC1 key must name P-256 in its parameters, since nothing else
says which curve a 32-byte scalar belongs to.

**(b) The checks of ADR 0009 (a) are kept, by other means.** An encrypted
key is still refused before it is decoded, so there is no passphrase prompt
to fear and none to suppress. The consistency check that was OpenSSL's
`EC_KEY_check_key` is now the conversion of the SEC1 structure into a secret
key: it refuses a zero or out-of-range scalar, and an embedded public point
that is not `d·G`.

**(c) The signature format is unchanged.** `p256` produces the fixed-size
`r || s` JWS wants directly, so the DER round trip is gone. Its signatures
are deterministic (RFC 6979) where OpenSSL's were random, which a verifier
cannot tell. Verification accepts both `s` and `n − s`, as OpenSSL did, so
the tokens OpenSSL signed with a high `s` still verify. A token OpenSSL
signed with the dev key is kept in the tests and verified by the new code.

## Consequences

- `openssl` is no longer a dependency of CAS itself. It is still in the
  tree through `webauthn-rs` 0.5; moving that is a separate change.
- A rolling deploy across the change needs nothing: old and new replicas
  publish the same JWKS and accept each other's tokens.
- The README's key-generation command still uses the `openssl` CLI; that is
  a tool on the operator's machine, not a dependency.
