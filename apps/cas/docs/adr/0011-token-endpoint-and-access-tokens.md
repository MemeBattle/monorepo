# 11. Token endpoint and access tokens

## Status

Accepted (2026-09-26), with [#743](https://github.com/MemeBattle/monorepo/issues/743).

## Context

`/authorize` (ADR 0010) hands a client a code bound to an account, a
redirect URI, scopes, a PKCE challenge and a nonce. The signing key and the
JWKS exist (ADR 0009). What is missing is the other half of the flow: the
endpoint that takes the code back, proves the client is the one it was
issued to, and answers with tokens.

`docs/PLAN.md` already chose the token format — JWT access tokens per RFC
9068, verified by resource servers against the JWKS — but only as a line in
a list, and the ticket asks for the decision to be recorded properly. The
rest was open: which claims a token carries and for whom, how long each
token lives, what a grant is in the schema and how a refresh token hangs off
it, how a client authenticates, what a replayed code does, and in which
shape the endpoint reports an error, since OAuth clients do not read CAS's
`ApiError`.

The lifetimes were confirmed by the owner, and the whole design was checked
against OWASP ASVS 5.0 chapter 10 (OAuth and OIDC), the OWASP OAuth 2.0
cheat sheet and RFC 9700 (the OAuth 2.0 Security BCP). Where a decision
below rests on one of them, it says which.

Only `grant_type=authorization_code` is served here. Refresh with rotation
and reuse detection is #744, the guest grant #746, `/userinfo` #745. The
schema those tickets need is created here, because the first refresh token
is issued here.

## Decision

**(a) Access tokens are JWTs (RFC 9068), not opaque tokens behind
introspection.** A resource server — ligretto's backends first — verifies
an access token locally against the published JWKS: CAS is not on the
request path of any application, and an outage of CAS does not stop a game
already in progress. The price is that an access token cannot be revoked:
it is honoured until `exp`. That is bought down by a short lifetime (c) and
by revocation living where it can, on the refresh side (d). Introspection
(RFC 7662) can be added later for a resource server that needs instant
revocation — agents are the likely one — without touching the others; the
opposite migration, from opaque tokens to JWTs, would touch every resource
server. The token header carries `typ: at+jwt` (RFC 9068 §2.1), which is
what lets a resource server refuse an ID token, signed by the same key,
presented as an access token.

**(b) The claim set, and `aud` per client.** An access token carries
`iss`, `sub` (the account id), `aud`, `client_id`, `scope` (the granted
scopes, space-separated, RFC 9068 §2.2.3), `exp`, `iat`, `jti` (a random
uuid), and two claims of CAS's own: `amr` and `account_type` (`full` or
`guest`, from `accounts.type`), so a resource server can treat a guest as a
guest without asking.

`aud` is not the client: it is the resource server the token is meant for,
configured per client as `clients.audience` (ADR 0008 (d) left the column to
this ticket). Both of ligretto's backends accept tokens for `ligretto`
whatever the client that obtained them is called, and a token minted for
one resource is refused by another — the audience restriction ASVS 10.3.1
and 9.2.3 and RFC 9700 §2.3 ask for. The value is held to the client id's
grammar, `[a-z0-9._-]` and at most 64 characters, for the reason ADR 0008
(a) gives for the id: it is configured on both sides, logged, and compared
byte for byte. A URI-shaped resource indicator (RFC 8707) is not needed by
any planned resource server, and widening the grammar later keeps every
stored value valid. A client registered without `--audience` is its own
audience; existing rows were backfilled that way.

`amr` is `["webauthn"]` for a full account, because every session of one
was opened by a passkey ceremony, and `["anon"]` for a guest, as PLAN fixes.
RFC 8176 registers neither value. Its registry describes factors — `hwk`,
`swk`, `user`, `pin`, `mfa` — and which of them a passkey was, a hardware
key or a synced one, a PIN or a fingerprint, is not something CAS is told.
A private value that names the ceremony says exactly what CAS knows.

The ID token (OpenID Connect Core §2) carries `iss`, `sub`, `aud` (the
client id: an ID token is for the client), `exp`, `iat`, `nonce` when the
authorization request carried one, `amr` and `account_type`; with `profile`
the display name as `name`; with `email`, when the account has an address,
`email` and `email_verified: false` — addresses are unverified in v1 (ADR
0007). `auth_time` is omitted: Core requires it only when `max_age` is
requested, which `/authorize` refuses (ADR 0010 (b)), and the value CAS
could give — when the session was opened, up to thirty days ago — would
mislead a client that asked. It arrives together with `max_age`. `at_hash`,
optional in the code flow, is omitted too.

**(c) Lifetimes: ten minutes for the access and the ID token, an absolute
thirty days for a refresh token.** `ACCESS_TOKEN_LIFETIME` is 600 seconds;
`expires_in` says so. Ten minutes is how long a stolen access token is
worth anything, and how long a revoked grant or an upgraded guest (PLAN)
still shows in tokens already out. The cost is one refresh per ten minutes
of play, which a backend does without the player noticing.

`REFRESH_TOKEN_LIFETIME` is thirty days, measured from the grant's creation
and absolute: every refresh token of a grant expires with the grant, and
rotation (#744) inserts successors with the same expiry rather than moving
it. ASVS 10.4.8 asks for an absolute expiry even where a sliding one is
added. Thirty days matches the session cap (ADR 0004 (c)); signing in again
once a month is one passkey touch.

The check that backed these numbers, requirement by requirement:

- ASVS 10.4.2 — a code is used once, and a replay revokes what it produced:
  (d), and ADR 0010 (e).
- ASVS 10.4.3 — a code lives at most a minute: sixty seconds, ADR 0010 (d).
- ASVS 10.4.6 — PKCE with S256 only, for every client: ADR 0010 (b), checked
  here in (f).
- ASVS 10.4.8 — refresh tokens have an absolute expiry: above.
- ASVS 10.3.1 and 9.2.3, RFC 9700 §2.3 — access tokens are
  audience-restricted: (b).
- OWASP OAuth 2.0 cheat sheet, RFC 9700 §2.2.2 — a refresh token issued to
  a public client is sender-constrained or rotated: rotation with reuse
  detection, #744. Until #744 lands a refresh token cannot be redeemed at
  all, so nothing is exposed in between.
- RFC 9700 §2.5 — client authentication with a shared secret is accepted
  (f); `private_key_jwt` or mutual TLS would be stronger, and is future
  work.

**(d) A grant per code exchange, refresh tokens hashed under it, and
`revoked_at` as the only revocation state.** A `grants` row is one
authorization of a client by an account: the account, the client, the
scopes the code granted, the code it was exchanged for, `created_at`,
`last_used_at` (moved by refresh, #744), the absolute `expires_at`, and
`revoked_at`. A first-party client gets one silently, as it gets a code
(ADR 0010 (f)); consent will decide for the others. There is no uniqueness
on account × client: each sign-in — each device — is its own grant, the
root of its own chain of refresh tokens, so that revoking one (a replayed
code here, a reused refresh token in #744) signs out that chain and not
every device of the account.

`refresh_tokens` rows hang off their grant: the SHA-256 of the token, never
the token; `expires_at`, copied from the grant in the insert itself; and
`used_at`, which rotation sets and which stays on the row until expiry so a
replay is recognised (PLAN). The token is 256 random bits, like a session
token (ADR 0004 (b)), and it is hashed without a KDF for the reason ADR
0008 (b) gives for client secrets: a slow hash protects a low-entropy human
choice, and there is none here — a KDF would cost every refresh and buy
nothing. Revoking a grant is setting `revoked_at`, which kills every token
under it; there is no second list. Deleting an account, a client or a grant
cascades; deleting a code (the cleanup) only unlinks its grant.

The grant and its first refresh token are written in one transaction, so
neither is ever visible without the other. A code presented a second time
revokes every grant its first redemption produced (RFC 6749 §4.1.2, ASVS
10.4.2): `Redemption::AlreadyRedeemed` carries the code's id for that,
`grants.authorization_code_id` finds the grant, and a warning names the code
and how many grants went. The column is nullable because the guest grant
(#746) has no code.

**(e) Two clocks: the database's for rows, the process's for tokens.**
`grants.expires_at` and `refresh_tokens.expires_at` are `now() +
make_interval(...)`, the database clock every replica agrees on (ADR 0002
(d)), like a code's. `iat` and `exp` in a JWT are the process clock:
they are read by other machines against their own clocks, a resource
server has no access to CAS's database, and a query for the time would buy
nothing. A replica whose clock drifts shifts the ten minutes a little;
running NTP is the deployment's job.

**(f) Client authentication first, then the grant, then the code, then the
verifier.** `POST /token` takes an `application/x-www-form-urlencoded` body
(RFC 6749 §3.2), of at most 8 KiB; anything else is `invalid_request`
before the body is read. A repeated parameter is `invalid_request` before
any other rule, and an empty one is an omitted one, as at `/authorize` —
the same `Params`.

A confidential client authenticates with `client_secret_basic` (an
`Authorization: Basic` header whose id and secret are each form-encoded,
§2.3.1) or `client_secret_post` (`client_id` and `client_secret` in the
body); a public client sends `client_id` alone, and discovery now lists
`none` beside the two, because that is what OpenID Connect Core §9 calls
it. Sending the secret both ways is two methods at once, which §2.3 forbids:
`invalid_request`. A body `client_id` next to the header is tolerated when
it names the same client, as some libraries send it anyway. An unknown
client, a missing or wrong secret, a malformed header, and a public client
presenting a secret are all the same `401 invalid_client`: the endpoint
does not say which clients exist. When the `Basic` scheme was tried, the
answer carries `WWW-Authenticate: Basic realm="cas"` (§5.2). The secret is
compared in constant time (ADR 0008 (b)).

Only then is the grant looked at: `grant_type` missing is `invalid_request`;
anything but `authorization_code` — `refresh_token` and the guest grant
included, until #744 and #746 — is `unsupported_grant_type`. `code`,
`redirect_uri` and `code_verifier` are required, the verifier in the RFC
7636 §4.1 grammar. A code that does not have the shape CAS issues is
`invalid_grant` without a query.

Redemption is `AuthorizationService::redeem` (ADR 0010 (e)), and it
consumes the code *before* the verifier is compared: a wrong verifier burns
the code (RFC 7636 §4.6), so whoever guessed wrong has no second try. The
comparison is `BASE64URL(SHA256(verifier))` against the stored challenge, in
constant time. Every way a code fails — unknown, expired, replayed, issued
to another client or redirect URI — is one `invalid_grant` with one
description; a wrong verifier has its own description, because it is the
integration bug a legitimate client most needs named, and the code is gone
by then anyway.

**(g) The error channel is RFC 6749 §5.2 JSON, with a type of its own.**
Every refusal is `{"error": "...", "error_description": "..."}`, `400`, or
`401` for `invalid_client`. `ApiError`'s `code` and `message` are not what
an OAuth client reads, so the endpoint's error type lives in
`oidc/http/token.rs` and `ApiError` stays as it is. A database failure the
classifier recognises is `503 temporarily_unavailable`, anything else `500
server_error`: §5.2 defines no code for either, and these two are borrowed
from the authorization endpoint's list (§4.1.2.1), as `/authorize` already
uses them, so a client can tell "try again" from "broken". The descriptions
are fixed strings; the only variable part is a parameter name from a fixed
list. The code, the secret, the verifier and the tokens appear in no log
line, and the tokens in no response but the success.

Every answer is `Cache-Control: no-store` and `Pragma: no-cache` (§5.1).
The endpoint is at the root with `ApiState`, next to `/authorize`, outside
`/api`: it reads no cookie, and the Fetch Metadata line (ADR 0005) guards
browsers' cookies, which a token request does not carry. Only `POST` is
served.

## Consequences

- An authorization code becomes `access_token`, `id_token`,
  `refresh_token`, `expires_in` and `scope`; a resource server verifies the
  access token against `/jwks.json` alone.
- Two tables, `grants` and `refresh_tokens`, and a new column,
  `clients.audience`. `.sqlx` gains three queries, and three more change
  (the client insert and lookup, and the replay check, which now returns
  the code's id). Rows past their expiry are never removed on the request
  path (ADR 0002); the scheduled cleanup, still to be written, gains these
  two tables.
- `cas-client register` takes `--audience`, and `scripts/seed-dev.sh`
  passes `--audience ligretto`. The previous release's `cas-client` cannot
  register a client once the migration has run, because it does not fill
  the new column; registration is a manual step, taken with the binary of
  the release that ran the migration.
- `/token` sends no CORS headers of its own: the root CORS layer allows
  only `CAS_CORS_ORIGINS`, the frontend. A public client running in a
  browser on another origin cannot call it until that is decided; ligretto
  exchanges the code from its backend, so nothing needs it yet.
- A replay that races the legitimate exchange — arriving before the first
  redemption's grant is committed, a window of milliseconds — finds no
  grant to revoke. The replay itself still gets nothing.
- Deferred: `auth_time` with `max_age`; introspection (a); sender-constrained
  tokens and `private_key_jwt` or mutual TLS for client authentication (c);
  CORS on `/token` for browser public clients.
- #744 reads `refresh_tokens` by hash, rotates under the grant's fixed
  expiry and revokes the grant on reuse; #746 inserts a grant with no code;
  #745 serves the ID token's claims again at `/userinfo`.
