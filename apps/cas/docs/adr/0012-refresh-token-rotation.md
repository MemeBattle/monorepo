# 12. Refresh token rotation

## Status

Accepted (2026-09-27), with [#744](https://github.com/MemeBattle/monorepo/issues/744).
Builds on ADR 0011 (c), (d), (f) and (g).

## Context

ADR 0011 issues a refresh token with every code exchange, stored as its
hash under a `grants` row with an absolute thirty-day expiry, and left the
use of it to this ticket: until now `grant_type=refresh_token` was
`unsupported_grant_type`. The schema is already there — `used_at` on a
token, `revoked_at` and `last_used_at` on a grant — and PLAN already says
what it is for: rotation marks the presented token used and inserts its
successor, and a used token presented again revokes the whole grant.

What was open is everything around that sentence: how a rotation is
ordered against another rotation of the same token and against a
revocation or a delete of its grant; what happens to the concurrent refresh
a legitimate client may send; whether a refresh may change the scope; which
client may present a token and what a presentation by another one does;
what the error says; what a refresh issues besides the new refresh token;
whether a grant is tied to the CAS session; and how another context — the
guest upgrade (#747) and, later, an account removal — revokes every grant
of an account.

A refresh token issued to a public client must be sender-constrained or
rotated (RFC 9700 §2.2.2, the OWASP OAuth 2.0 cheat sheet); CAS has no
sender-constraining, so rotation with reuse detection is what makes the
public client's refresh token acceptable, and ADR 0011 (c) counted on it.

## Decision

**(a) The refresh grant.** `POST /token` with `grant_type=refresh_token`,
the `refresh_token` and an optional `scope` (RFC 6749 §6). The client
authenticates exactly as for a code (ADR 0011 (f)), and first: an
unauthenticated request never reaches the token. The answer is the whole
§5.1 body, as for a code, with a new refresh token every time. A value that
does not have the shape of a token CAS issues is `invalid_grant` without a
query, as a code is. `refresh_token` and `scope` join the parameters whose
repetition is `invalid_request` before any other rule.

**(b) Rotation, and reuse as theft, with no grace window.** One transaction
locks the presented token's grant, then the token, checks them, marks the
token used (`used_at`), moves `grants.last_used_at`, and inserts the
successor with the grant's expiry. A token already used, presented again,
revokes its grant (`revoked_at`), which kills every token under it — the
successor included — and the request is `invalid_grant`. The used row stays
until its expiry precisely so that it is recognised (ADR 0011 (d)).

Two refreshes with one token are serialised by the grant's row lock, and
the second is a reuse: a client that retries a refresh whose answer it lost
is signed out of that grant. That is accepted. RFC 9700 §4.14.2 and the
OWASP cheat sheet describe exactly this detection; a grace window in which
a used token still refreshes would reopen the replay it exists to close,
and whoever holds a stolen token would only need to be quick. The cost is
one sign-in — a passkey touch — on that device alone, because each sign-in
is its own grant (ADR 0011 (d)).

The lock is taken with a consuming read rather than a consuming `UPDATE`
(as a code is redeemed, ADR 0011 (f)) because the client binding (d) and
the scope (c) have to be checked before the token is spent. Holding the
grant row also orders a rotation against a concurrent revocation — an
account-wide revocation (h), a replayed code, a reuse: whichever commits
second sees what the first wrote.

The order is the grant, then the token, in separate statements. It is the
order of the `ON DELETE CASCADE` from `accounts` and from `grants`, which
lock the grant and then delete its tokens, so a rotation and a delete never
each hold what the other waits for (PostgreSQL's consistent lock order
rule). Any future writer of `refresh_tokens` must keep it.

**(c) Scope on refresh.** Omitted, the refresh gets the grant's scopes.
Present, every scope it names must be in the grant, otherwise
`invalid_scope`; a malformed value is the same `invalid_scope` `/authorize`
answers. A proper subset is accepted and ignored: the tokens carry the
grant's full scopes, and the response's `scope` says so — RFC 6749 §3.3
lets the server ignore a requested scope and requires `scope` in the
answer when the two differ; CAS always sends it. Narrowing can be added
later without breaking a client that relies on this; nothing needs it now.

**(d) Bound to the client.** A live token is honoured only for the client
whose grant it belongs to (RFC 6749 §6). Another authenticated client
presenting it gets `invalid_grant`, and nothing changes: the token is not
spent and the grant is not revoked. A confidential client's token is
useless without its secret, and revoking on such a presentation would let
anyone who has seen a token sign its owner out. A used token is different:
it revokes its grant whoever presents it, because it has leaked either way.

**(e) One answer for a dead token.** Unknown, expired (the token or its
grant), revoked, used, or another client's: the same `invalid_grant` with
one fixed description. The client's remedy is the same — sign in again —
and a finer answer would help only someone probing tokens. The logs keep
the cases apart: a warning for a reuse and for another client's
presentation, naming the grant, never the token.

**(f) What a refresh issues.** A new access token and a new ID token, as
OpenID Connect Core §12.2 allows. The account's claims are read again at
refresh time — the display name, the address, `account_type` — so a change
reaches the client within one access token lifetime; `nonce` is omitted,
since there is no authorization request to take one from; `iat` and `exp`
are new. The guest upgrade (#747) relies on this to get a fresh
`id_token_hint`.

**(g) Not bound to the CAS session; an absolute expiry.** A grant has no
session: signing out of CAS leaves every grant alive, as PLAN fixes, and an
application keeps its sign-in until the grant ends. That end is the
thirty-day cap from the grant's creation (ADR 0011 (c)), which rotation
never moves: the successor copies the grant's expiry. `last_used_at` is
informational, for the scheduled cleanup and a future "connected
applications" view, and extends nothing.

**(h) Account-wide revocation is one statement, exposed as a service.**
`oidc::revoke_account_grants(executor, account_id)` sets `revoked_at` on
every live grant of the account in one `UPDATE` and returns how many it
revoked. It runs on the caller's executor, so the caller revokes in the
transaction that decides it: the guest upgrade (#747) calls it inside its
upgrade transaction with the account row locked. Other contexts reach it
through this service, never through the OIDC repository (LAYOUT rule 7).
Deleting an account row needs no call — its grants and tokens go by
cascade, which is stronger than revocation — but an account removal that
keeps the row (a soft delete, an anonymisation) must call it.

## Consequences

- `grant_type=refresh_token` is served; discovery already advertised it.
  `unsupported_grant_type` now names both grants, and `invalid_scope`
  joins the endpoint's errors.
- A client must not refresh the same token twice concurrently: the second
  request revokes the grant. Ligretto's backend must serialise refreshes
  per grant, and the integration guide (#751) must say so.
- `.sqlx` gains seven queries: the three statements of the locking read,
  retiring a token, touching a grant, revoking one grant, revoking an
  account's grants. No migration.
- Used and expired token rows accumulate until the scheduled cleanup (ADR
  0002), which must keep a used row for as long as its grant lives, or a
  reuse stops being recognised.
- #747 calls `revoke_account_grants` in its upgrade transaction; a future
  account removal that keeps the row calls it too. #745 and #746 build on
  the same grant.
