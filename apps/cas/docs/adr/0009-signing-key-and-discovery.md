# 9. Signing key, discovery and JWKS

## Status

Accepted (2026-09-26), with [#741](https://github.com/MemeBattle/monorepo/issues/741).

## Context

`docs/PLAN.md` fixed the token format: ES256 JWTs (RFC 9068), verified by
the resource servers locally against a published JWKS rather than by asking
CAS. `/token` (#743) needs a key to sign with, and every client, before it
sends a user anywhere, reads the discovery document to learn where the
endpoints are and which key set to trust.

What PLAN left open is where the key comes from, how a token names the key
that signed it, how the key is replaced on a service that runs as several
stateless replicas (ADR 0002) with no place to keep a schedule, and how a
developer runs the server without any of it. The last item of PLAN's open
questions, the "signing-key rotation procedure", is answered here.

## Decision

**(a) One algorithm, ES256, and one key type, P-256, loaded from
`CAS_SIGNING_KEY` as PEM.** No RSA and no algorithm negotiation: the
discovery document advertises exactly `ES256`, so a verifier has one path
to get right. A key that is not P-256, is encrypted, or fails OpenSSL's
consistency check (`EC_KEY_check_key`: the public point is on the curve and
is `d·G`) is refused at startup. The refusal names the variable and the
position of the offending block and quotes nothing of the value, because
the startup message ends up in logs. An encrypted key is refused before
OpenSSL reads it: OpenSSL's default behaviour for one is to prompt for a
passphrase on the terminal, and a server that stops to ask a question is
the opposite of failing clearly. The consistency check exists because
parsing does not prove it: a key with an altered private scalar still
parses, and CAS would publish a JWK that cannot verify its own signatures.

The key never lives in the database. Replicas share it through the
environment the way they share `DATABASE_URL`, and there is nothing to
migrate and nothing to leak through a backup.

**(b) `kid` is the RFC 7638 JWK thumbprint of the public key.** Derived,
not chosen: every replica publishes the same identifier for the same key
without coordinating, a restart changes nothing, and a resource server that
caches JWKS by `kid` sees a new `kid` exactly when there is a new key. An
operator-chosen `kid` would be one more value to keep in step with the key
and one more way for two replicas to disagree.

**(c) The development default exists only in debug builds.**
`apps/cas/dev/signing-key.pem` is compiled in through `include_str!` behind
`cfg(debug_assertions)`, so `bacon run` and `cargo test` need no variable,
and a release server refuses to start without one. The key is public by
construction — it is in git — and that is acceptable for the same reason
the `cas:cas` database default is: nothing built for production can reach
it. A runtime check on `APP_ENV` was rejected: a release binary would then
run on a public key whenever the variable was forgotten and `APP_ENV` was
too, which is exactly the misconfiguration the default must not survive.

`Config` holds the key as an `Option` rather than requiring it, because
`cas-migrate` and `cas-client` read the same configuration and never sign;
they must keep starting in a release build with no key. The server is the
one that needs a key, so the server is where its absence is an error. The
PEM is not parsed in `config`, which knows no context (`docs/LAYOUT.md`
rule 5); it is read by the `oidc` context when the router is built.

**(d) Rotation is a list.** `CAS_SIGNING_KEY` may hold several PEM blocks.
The first signs; all are published in `/jwks.json`. Rotating is then a
sequence of deploys, each a change to that one value:

1. append the new key — it is published, not yet signing;
2. wait until every verifier's cached JWKS holds it (the documents are
   cached for an hour, and resource servers keep caches of their own);
3. move it first — it signs from now on, the old key is still published;
4. once every token the old key signed has expired, drop it.

There is no `CAS_PREVIOUS_SIGNING_KEY`, no activation timestamp in the key
set and no in-process schedule, which ADR 0002's statelessness would forbid
anyway: the operator and the deploy pipeline drive the steps, and the JWKS
reports the state they left. Framing is strict for the same reason — a PEM
block with a missing or mismatched boundary is an error, never skipped,
because a skipped block is a rotation key that silently never gets
published.

**(e) The two documents are static per process and public.** Both are
built once, from `CAS_ISSUER` and the key list, and served at the router
root, outside `/api`: no session cookie, no Fetch Metadata guard (ADR 0005)
and not `no-store` (ADR 0004 (i)). They carry
`Cache-Control: public, max-age=3600` instead, because they change only on
a rotation and the rotation procedure accounts for the hour.

`CAS_ISSUER` is a variable of its own. It cannot be derived from
`CAS_ORIGIN`, which is the frontend's origin, nor from the request's
`Host`, which the caller controls. Discovery §4.3 requires the published
`issuer` to be identical to the value the client was configured with, so it
is published byte for byte as typed, and a value that would need repair —
a trailing slash, anything the WHATWG parser would rewrite, a query or a
fragment — is refused at startup rather than normalised. That is the rule
ADR 0008 (c) applies to redirect URIs, for the same reason: a repaired
value is not the value anyone configured.

**(f) Discovery advertises the whole SSO milestone, not only the endpoints
that exist.** `/authorize`, `/token`, `/userinfo`, `/end_session` and the
guest grant `urn:memebattle:oauth:grant-type:guest` appear now, so the
document stays the same across #742–#746 and a client configured against it
does not have to re-read it after each release. Until their tickets land,
those paths answer 404.

**(g) Signing is a small function over OpenSSL, not a JWT crate.**
`SigningKey::sign` produces a compact JWS whose header carries `alg`, `typ`
and `kid`; claims, lifetimes and validation are #743's to decide. OpenSSL
was already linked through `webauthn-rs`, so the crate compiles no new
code. The one subtle step, the JWA §3.4 signature encoding (`r || s`,
32 bytes each, instead of OpenSSL's DER), is cross-checked in tests by an
independent implementation, `openidconnect`, which runs its own discovery
against the router and verifies a signature CAS produced.

## Consequences

- `openssl` becomes a direct dependency, with nothing new to download;
  `openidconnect` is a dev dependency without its HTTP client features.
- #743 takes `SigningKeys` from where `http::app` builds it and needs no
  key handling of its own. The `kid` in every token header is the
  thumbprint of the key that signed it.
- Production must set `CAS_SIGNING_KEY` and `CAS_ISSUER`: the first has no
  default in a release build, the second's default is the development
  address. The deploy pipeline does not exist yet; the README says so.
- A private key is committed to the repository. It is a development
  fixture that no release build can use, and the comment in the file says
  so; a secret scanner that flags it is answered by (c).
- Plain `cargo run` now starts the server (`default-run = "cas"`), which is
  what `bacon run` executes.
