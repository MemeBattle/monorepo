# 4. Cookie sessions

## Status

Accepted (2026-09-12), with [#667](https://github.com/MemeBattle/monorepo/issues/667).
Amended (2026-09-12) by [#697](https://github.com/MemeBattle/monorepo/issues/697):
decision (c) gained an idle timeout with sliding renewal.

## Context

Registration (ADR 0001) and login (ADR 0003) prove who a browser is at one
moment. Something has to carry that proof to the next request: the dashboard,
passkey management (#668), and later the OIDC `/authorize` endpoint, which
must know who is asking before it can issue a code to a client.

CAS runs as several replicas (ADR 0002), so whatever a session is, it cannot
live in a process. The frontend is served from a different origin in
development and must be able to call the API with the session attached.

## Decision

**(a) Server-side sessions, referenced by a random token in a cookie.** A
session is a row in `sessions`; the cookie holds 256 random bits, base64url
encoded. No signed or encrypted cookie: a row can be revoked, listed and
expired by the server, and an opaque token reveals nothing if the cookie is
ever read.

**(b) The row stores the SHA-256 of the token, never the token.** A read of
the table, in a backup or over the shoulder in `psql`, does not hand out live
sessions. Lookup is by the hash, which is the unique column. The token exists
in memory only between its generation and the response that sets the cookie.

**(c) Two clocks, both the database's: an idle timeout of 7 days with
sliding renewal, under an absolute cap of 30 days.** The row's `expires_at`
is fixed at creation and never moves; `last_seen_at` is reset by an
authenticated request, and a session is live only while it is before the cap
and was seen within the idle timeout. Renewal is not a write per request: a
request inside the renewal window (one hour) after the last reset writes
nothing, one outside it resets the clock and moves the account's
`last_seen_at` with it, in one transaction, as at creation. The clock lags
the last request by up to an hour, so measured from that request a session
ends between seven days less an hour and seven days, and a session in
constant use costs one write an hour. The write checks the window again
itself: two requests that both read the clock as due renew it once, the
second finding nothing to do, and a request whose session logout removed in
between is unauthenticated, not an error. The cookie's `Max-Age`
runs to the moment the session stops being honoured if nothing renews it,
the idle timeout or the cap, whichever is first, and a renewal re-sends the
cookie with the clock pushed out, so the browser and the server give up
together, as before. Expired rows of either kind are not returned and are
not removed by the application: like `webauthn_ceremonies`, cleanup is a
scheduled job, never part of the request path.

The first version of this decision had one absolute clock of 30 days and no
idle timeout, on the grounds that a sliding expiry costs a write on every
request. The OWASP Session Management guidance asks for an idle timeout on
top of an absolute one, and the objection falls once renewal is rate limited
by the window. Seven days is long for OWASP and short for a game: it is what
a player who opens the game most weeks never notices, and a passkey makes
signing in again a single touch rather than a password to remember, which is
what makes a shorter idle limit affordable here. The cap stays at 30 days as
the bound on how long a stolen cookie is worth anything, however active the
thief. The cookie stays persistent (`Max-Age` rather than a session cookie):
a game's players close the tab between rounds, and a non-persistent cookie
would sign them out every time.

**(d) The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only, and
`Secure` when the relying party origin is https.** `HttpOnly`: script never
reads it. `Lax` rather than `Strict`: the future `/authorize` redirect is a
top-level navigation from another site and must carry the cookie; `Lax` still
withholds it from cross-site POSTs, which is the CSRF line. `Secure` follows
the scheme of `CAS_ORIGIN` because Safari refuses a `Secure` cookie over plain
http even from localhost, and the development origin is plain http.

**(e) CORS allows credentials, and therefore lists methods and headers.**
The frontend calls the API cross-origin in development with
`credentials: 'include'`. Browsers refuse `Access-Control-Allow-Credentials`
next to a wildcard, so the allowed methods and headers are enumerated. The
JSON content type forces a preflight on every state-changing request that
carries a body, which together with `SameSite=Lax` is the CSRF posture of this
change. It has one known gap: `POST /api/logout` takes no body, so a cross-site
HTML form can reach it and only `SameSite=Lax` stands in the way. OWASP counts
`SameSite` as defence in depth, not as a defence on its own. The exposure is a
forced sign-out, nothing more, and it is closed by a Fetch Metadata / `Origin`
check on every mutating request (ADR 0005, from
[#696](https://github.com/MemeBattle/monorepo/issues/696)), which also covers
body-less endpoints to come (passkey delete, #668).

**(f) Registration and login sign the account in.** Their finish handlers
create a session and set the cookie in the same response. The session is
written after the ceremony's transaction commits: a failed session write after
a successful login is a 503 the client retries by signing in again, and the
recorded credential use is not undone. Session creation also moves the
account's `last_seen_at`, in the session's own transaction: signing in is the
activity guest GC will look for.

**(g) One 401 code, `unauthenticated`, for every way a request fails to
carry a session** — no cookie, a malformed one, an unknown, expired or
revoked session. The client's remedy is the same in every case, and a probe
learns nothing about which sessions exist. `POST /api/logout` is the
exception: it is idempotent and never a 401. A browser holding a stale cookie
is asking to forget it, and the answer to that is yes; the cookie is cleared
whether or not a row was found.

**(h) `Authenticated` is an axum extractor.** A handler that takes one runs
only for a request with a live session and receives the session and the
account; the 401 happens before the handler. It lives in the sessions
context's transport and is the one thing other contexts import from it. The
extractor is also where renewal happens, and since an extractor cannot touch
the response, a layer on the `/api` router carries the renewed cookie out:
the extractor leaves it in a per-request slot, the layer sets it on the way
back. A handler that sets the session cookie itself wins over the layer.

## Consequences

- `GET /api/me` answers with the account (id, display name, type, email) and
  when the session ends if left alone (the idle timeout from its last reset,
  or the cap, whichever is first), nothing else about the session.
- A session outlives a passkey: deleting a credential (#668) does not end the
  sessions that were opened with it. Ending them is an explicit act, and a
  "sign out everywhere" belongs with session listing, later.
- Every authenticated request costs two reads: the session by hash, then the
  account by id. A join would save one round trip and put another context's
  columns in this context's SQL; the round trip is the cheaper price. A
  request that renews the session adds one transaction with two writes, at
  most once an hour per session.
- The `sessions` table grows by one row per sign-in and per expired session
  until the scheduled cleanup exists; the indexes on `expires_at` and
  `last_seen_at` are there for it, and it must delete rows past either
  clock.
- Renewal makes `last_seen_at` on `sessions` and on `accounts` move
  together, so account activity for guest GC (M2) is as fresh as the
  renewal window, not as fresh as the last sign-in.
- The session id is the row's identity for the future management screen; the
  token never identifies a session anywhere but in the lookup.
- Hardening that OWASP recommends and this change leaves out is tracked
  separately: the CSRF layer ([#696](https://github.com/MemeBattle/monorepo/issues/696),
  done in ADR 0005), the timeout decision ([#697](https://github.com/MemeBattle/monorepo/issues/697),
  done in (c) above),
  `Cache-Control: no-store` and `Clear-Site-Data`
  ([#698](https://github.com/MemeBattle/monorepo/issues/698)), session
  lifecycle logging ([#699](https://github.com/MemeBattle/monorepo/issues/699))
  and the `__Host-` cookie prefix
  ([#700](https://github.com/MemeBattle/monorepo/issues/700)).
