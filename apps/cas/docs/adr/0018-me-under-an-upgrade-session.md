# 18. GET /api/me under an upgrade session

## Status

Accepted (2026-10-04), with [#749](https://github.com/MemeBattle/monorepo/issues/749).
Amends ADR 0015 (a): `GET /api/me` is no longer among the endpoints closed
to an upgrade session. Builds on ADR 0014 and ADR 0015 (b).

## Context

ADR 0015 (a) closed every endpoint behind the `Authenticated` extractor to an
upgrade session, `GET /api/me` included, and its Consequences left one
question to #749: a guest dashboard that wants to show the account type
needs a decision of its own.

The frontend has to tell a guest from a signed-out browser. A guest that
abandoned the upgrade and opens the dashboard must see what it is and how to
finish, not the sign-in screen; and the gate in front of sign-in and
create-account must not forward a guest to `return_to`, because CAS answers
an upgrade session at `/oidc/authorize` with create-account again, which is
a loop. The frontend has nothing else to go on: the session cookie is
`HttpOnly`, and the URL cannot say, because CAS sends a guest and a new user
to the same `/create-account?return_to=…`, and anything in a URL is
attacker-writable.

What was open:

- Whether `/api/me` answers an upgrade session, and what that reveals.
- How a handler opts in without loosening default deny for the others.
- Whether the answer names the session kind.
- Whether the read is logged as the refused ones are.
- The order in which the backend and the frontend can be deployed.

## Decision

**(a) `GET /api/me` answers an upgrade session, with the same body.** It is
the guest: `accountType: "guest"`, the generated `Guest <n>` name,
`email: null`, and the upgrade session's expiry. Two facts are new to the
holder of an upgrade session, beyond what the hint already told them: the
generated name, which ADR 0014 keeps out of the tokens and userinfo, and when
the upgrade session ends. Both are accepted. The name is a label CAS
generated and says nothing about a person; ADR 0014 made it per guest
precisely so that CAS's own screens can show it, and keeping it from
applications — so none presents it as a name the user chose — is not
undone by showing it on CAS's own screen. `n` tells roughly how many guests
were minted, to someone who can already mint one or be one. The expiry is at
most the fixed hour. By ADR 0015 (b) the session stops resolving the moment
the account is full, so the read never describes a full account: the
fixation attacker of ADR 0015 learns nothing about the victim.

**(b) Opt-in by a second extractor; `Authenticated` stays full-only.**
`AnySession` is the same lookup and the same 401, admitting both kinds, and
`GET /api/me` is the one handler that takes it. Default deny holds for every
present and future endpoint: `PATCH /api/me`, passkey listing, renaming,
deletion and addition stay closed without anyone touching them. Rejected:
relaxing `Authenticated` with a flag, because every handler would then have
to remember which way it is set; and reading the session in the handler with
`resolve_session`, because `/api/me` has no behaviour without a session —
"a session of either kind, or 401" is exactly what an extractor is.

**(c) No session kind in the body.** `accountType: "guest"` is the signal: a
resolved session of a guest is always an upgrade session (a guest has no
other, ADR 0014; an upgrade session of a full account does not resolve,
ADR 0015 (b)). Rejected: a `sessionKind` field, which would be two sources
for one fact; and a separate endpoint, which would be a second request on
every navigation of the frontend.

**(d) The read is not logged as a refusal.** `Authenticated` warns when it
refuses an upgrade session, because one has no business there unless
something is probing what it can do. Behind `AnySession` it does have
business, so nothing is logged beyond what any session lookup logs.

**(e) The frontend that knows a guest ships before or with this backend.**
A frontend that does not know a guest would read a guest's `/api/me` as
"signed in" and forward it to `return_to`, and CAS would send it back to
create-account, in a loop. The frontend that never forwards a guest
(cas-frontend ADR 0003) must be serving before or together with this
release. Guest-enabled clients are still off (ADR 0014, ADR 0015 (h)), so
nothing in production can reach the path today.

## Consequences

- `GET /api/me` documents the guest answer in `openapi.json`; its error
  codes are unchanged.
- A browser holding an upgrade session no longer looks signed out to the
  frontend. Sign-in and create-account stay reachable for it because the
  frontend's gate says so (cas-frontend ADR 0003 (b)), not because `/api/me`
  fails.
- The UI still must not rely on hiding anything: the 401s of every other
  endpoint under an upgrade session remain the guarantee.
- A future endpoint that an upgrade session needs opts in by taking
  `AnySession`, and the decision to do so is recorded like this one.
