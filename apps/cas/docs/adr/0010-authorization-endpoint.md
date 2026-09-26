# 10. Authorization endpoint and authorization codes

## Status

Accepted (2026-09-26), with [#742](https://github.com/MemeBattle/monorepo/issues/742).

## Context

Discovery (ADR 0009) already advertises `{issuer}/authorize`, the `code`
response type, the `query` response mode and `S256` as the only PKCE
method. The registry (ADR 0008) answers who may ask: a client, its exact
redirect URIs, its allowed scopes and whether it is first-party. What is
left is the endpoint itself, and it has more open questions than lines of
code:

- which errors may be sent to the redirect URI and which must not, since
  sending one to an unverified URI is an open redirect;
- how an anonymous user reaches sign-in and comes back, on a service that
  keeps no per-request state in memory and runs as several replicas
  (ADR 0002);
- what a code is, what it is bound to and how long it lives;
- how one-time use is enforced when two replicas may see the same code at
  once;
- what happens to a client that would need the account's consent, which
  does not exist yet;
- what the OIDC parameters CAS does not implement mean when a client sends
  them.

## Decision

**(a) Two error channels, decided by whether the redirect URI is trusted
yet.** An unknown client, a `redirect_uri` that is missing, repeated or not
registered, and a request with no parameters at all render an HTML page
from CAS with a stable code (`unknown_client`, `invalid_redirect_uri`,
`invalid_request`) and never redirect: RFC 6749 §4.1.2.1 says the
authorization server MUST NOT redirect in that case, because the address
is exactly what has not been verified. One code, `unknown_client`, covers a
`client_id` that is missing, repeated, malformed or not registered:
telling an unknown caller which of the four it was is enumeration help
nobody legitimate needs. A database failure while the client is being
looked up is on the same side of the line and answers `503`
`service_unavailable`, or `500` for a failure the classifier cannot name.

Everything after that point redirects with `error`, `error_description`
and `state`, including a database failure (`temporarily_unavailable` or
`server_error`, the two codes RFC 6749 defines for it). `state` is echoed
only when it was sent exactly once and not empty. The descriptions are
fixed strings; the only request-derived text in them is a scope token that
passed the scope grammar or a parameter name from a fixed list, so nothing
an attacker shapes is reflected. The page is a minimal document of fixed
strings and renders nothing from the request, so there is no escaping to
get wrong.

**(b) What a valid request is.** `response_type=code` only. `scope`
includes `openid` and stays inside the client's allow-list. `state` is
required and at most 512 bytes: RFC 6749 only recommends it, but every
planned client is ours, and a CSRF-bound `state` costs a client nothing.
`code_challenge` (the RFC 7636 grammar) with `code_challenge_method=S256`
is required for every client, public or confidential, as OAuth 2.1
requires. `nonce` is optional and at most 512 bytes. `redirect_uri` is
required even for a client with one registered URI (RFC 6749 allows
omitting it, OAuth 2.1 and the security BCP do not) and is compared byte
for byte (ADR 0008 (c)). A repeated parameter is `invalid_request` (RFC
6749 §3.1), checked before any other rule, and an empty value is treated
as an omitted one, as the same section requires.

Two kinds of parameter CAS does not implement are told apart. A
*requirement* — `prompt` other than `none`, `max_age`, `id_token_hint`
(until #747), `request`, `request_uri`, `registration`, a `response_mode`
other than `query` — is refused through the redirect URI, with the code
OpenID Connect Core assigns where it assigns one (`request_not_supported`,
`request_uri_not_supported`, `registration_not_supported`) and
`invalid_request` otherwise. Ignoring one would hand a code to a client
that asked for a fresh authentication against a session up to thirty days
old, or show a UI to a client that promised its user none. `prompt=none`
is honoured: without a session the answer is `login_required`, never the
sign-in screen. A *hint* (`login_hint`, `display`, `ui_locales`,
`acr_values`, `claims_locales`, `claims`) and any unknown parameter are
ignored, as both specifications allow. Discovery states
`request_uri_parameter_supported: false`, because its default is `true`
and would contradict the refusal.

**(c) Sign-in by redirect, no interaction table.** Without a session,
`/authorize` answers `302` to
`{CAS_ORIGIN}/sign-in?return_to=/authorize?<query>`. The request is
validated first, so a broken request fails before the user is sent
anywhere. The whole authorization request travels in `return_to`; nothing
is stored, any replica can finish it, and the frontend's part (#748) is to
navigate to `return_to` once the ceremony is done. The value is a relative,
same-origin path by construction, which is what the frontend accepts. An
interaction table would have bought a shorter URL at the price of a row per
visit, an expiry to clean up and one more thing that differs between
replicas.

**(d) A code is 256 random bits, stored as its SHA-256, bound to what
issued it, alive for 60 seconds.** The code is generated like a session
token (ADR 0004) and the table keeps only its hash, so a read of
`authorization_codes` hands out nothing redeemable. The row binds the
client, the redirect URI exactly as sent, the granted scopes, the PKCE
challenge, the nonce, the account and the session. The session binding is
a foreign key with `ON DELETE CASCADE`: signing out of CAS voids the codes
that session issued and nobody redeemed yet. `code_challenge_method` is
not stored, because only `S256` is accepted. Expiry is the database clock
(ADR 0002). Sixty seconds is RFC 6749 §4.1.2's "maximum of 10 minutes"
narrowed to what a redirect actually needs.

**(e) Redemption is one atomic `UPDATE`, and a redeemed row is kept.**
`UPDATE ... SET redeemed_at = now() WHERE code_hash = $1 AND redeemed_at
IS NULL AND expires_at > now() RETURNING ...` consumes the code: two
replicas redeeming it at once take the row lock in turn, and the second
matches nothing. Unlike a WebAuthn ceremony row, the redeemed row is not
deleted: keeping `redeemed_at` lets a second presentation be reported as
`AlreadyRedeemed` rather than `Unknown`, which is what RFC 6749 §4.1.2 asks
the token endpoint to act on (revoke what the code produced, #743/#744).
Only when nothing was consumed does a second query ask why, so the happy
path is one statement. The client and redirect URI are compared after the
row is consumed, so a code presented by the wrong client is burnt: whoever
guessed wrong has spent it. Rows past expiry leave with the scheduled
cleanup, never on the request path (ADR 0002).

**(f) No consent yet: a client that is not first-party is refused with
`unauthorized_client`.** Consent arrives with agent delegation; until then
a client that would need it cannot obtain a code, with or without
`prompt=none`. `unauthorized_client` ("the client is not authorized to
request an authorization code using this method") is the RFC 6749 code
whose meaning fits. OIDC's `consent_required` was rejected: it is defined
as an answer to `prompt=none` and would tell the client that showing a
consent screen would help, which it would not.

**(g) The endpoint lives at the root with `ApiState`, resolves the session
itself, and renews it as `/api` does.** It is not under `/api`, so the
Fetch Metadata line (ADR 0005) does not apply: a cross-site top-level
`GET` is exactly what `/authorize` receives, and the `SameSite=Lax`,
`Path=/` cookie (ADR 0004 (d)) is what lets that navigation carry the
session. It does not take `Authenticated` as an extractor, because an
extractor runs before validation and answers a database failure in JSON;
the handler validates first and then calls `resolve_session`, the function
the extractor itself is built on, and routes a failure through (a). One
resolution path means sliding renewal (ADR 0004 (c)) applies here too —
authorizing an application is using CAS — and the router carries the
renewal layer so the fresh cookie reaches the browser. Only `GET` is
served: axum would answer `HEAD` from the `GET` handler and mint a code
for a response nobody reads, so `HEAD` is refused explicitly. Every answer
is `Cache-Control: no-store`, because the `Location` of a success carries
a code.

## Consequences

- `/token` (#743) gets `AuthorizationService::redeem` with failures it can
  tell apart, and the stored challenge, scopes, nonce, account and session
  it needs to verify the PKCE verifier and issue tokens.
- The frontend (#748) gets the `return_to` contract. Until it lands, and
  until its dev server proxies `/authorize`, a signed-out user who signs in
  is not sent back.
- `id_token_hint` (#747) will extend (b); the consent screen will replace
  (f).
- `ApiState` holds the authorization service and the frontend origin.
- A new table, `authorization_codes`, and three new entries in `.sqlx`.
  The scheduled cleanup, still to be written, gains a third table.
- CAS serves HTML for the first time: one error page of fixed strings, in
  `oidc/http/authorize.rs`. If backend pages ever get a design, it is
  replaced in one place.
