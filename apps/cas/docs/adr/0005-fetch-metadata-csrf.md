# 5. Fetch Metadata as the CSRF line

## Status

Accepted (2026-09-12), with [#696](https://github.com/MemeBattle/monorepo/issues/696).

## Context

The session cookie (ADR 0004) is `SameSite=Lax`, and a JSON body forces a
CORS preflight on every state-changing request that has one. Together they
kept cross-site requests out, with one gap: `POST /api/logout` takes no body,
so a form on another site can post to it with the victim's cookie attached
and only `SameSite=Lax` stands in the way. Passkey management (#668) adds
`DELETE` endpoints with the same shape, and more will follow.

OWASP counts `SameSite` as defence in depth, not a defence on its own: the
browser's default for a cookie without the attribute has moved more than once,
and an attacker on a sibling subdomain is same-site by definition. The
[OWASP CSRF cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
asks for a primary defence: a synchronizer token, a double-submit cookie, or
a check of where the request came from.

CAS has no HTML forms of its own yet and its frontend talks JSON across
origins. A token scheme would add state, a header the frontend has to fetch
and echo, and a failure mode for every client. The browser already states
where a request came from, in `Sec-Fetch-Site` (Fetch Metadata, every
current browser since 2023) and in `Origin`.

## Decision

**(a) A layer on the `/api` router refuses a mutating request that does not
come from this site or from an allowed origin.** Mutating means any method
but `GET`, `HEAD` and `OPTIONS`. The layer wraps the whole `/api` router,
fallback included, so a new endpoint is protected by where it is mounted and
not by remembering to add anything. `/health` stays outside: read-only, and
probed by machines that send no browser headers.

**(b) `Sec-Fetch-Site` is the authority when present.** `same-origin` and
`none` pass. `none` is a user-initiated request (typed URL, bookmark), which
a third party cannot forge. `same-site` and `cross-site` pass only with an
`Origin` in `CAS_CORS_ORIGINS`. A sibling subdomain is same-site, shares the
cookie jar (`SameSite=Lax` does not withhold the cookie from it) and can post
an HTML form that no CORS preflight ever sees; it is not this service and is
trusted only when the origin list names it. The frontend is in that list
already, wherever it is served from. A value this code does not know is read
as `cross-site`: the safe reading of an unknown claim.

**(c) Without Fetch Metadata, `Origin` decides alone.** A request with no
`Sec-Fetch-Site` is a browser from before Fetch Metadata or not a browser at
all (curl, a server, a test). It passes when `Origin` is absent or allowed.
Non-browser clients carry no cookie that was set by someone else, so they
have nothing to forge; a browser that sends `Origin` but no Fetch Metadata is
held to the origin list. An `Origin` of `null` is not an allowed one.

**(d) The origin list is the CORS list.** One configuration variable says
which sites may talk to the API with credentials, and both the preflight and
this check read it. Comparison is exact, byte for byte, on the serialized
origin: no trailing slash, no case folding, no suffix matching.

**(e) Refusal is `403` with code `cross_site_request`**, in the standard
`ApiError` shape, before the handler runs and before any database access.
The reason (no Fetch Metadata vs. a cross-site claim) is logged at `warn`
with the method, path and both headers; the client sees one answer.

## Consequences

- The cross-site form post to `/api/logout` from ADR 0004 (e) now fails at
  the layer and leaves the session untouched. Every body-less mutating
  endpoint to come, including passkey delete, is covered on arrival.
- `GET` is untouched by the layer. The OIDC `/authorize` redirect (M2)
  arrives as a cross-site top-level navigation and must keep working; a
  `GET` that mutates state would bypass the check, so there must never be
  one.
- A mutating request from the frontend must carry either Fetch Metadata or
  an `Origin`. Browsers send both with `fetch`; a test that builds requests
  by hand and sends neither passes on the non-browser branch.
- Adding a frontend origin means adding it to `CAS_CORS_ORIGINS`, which is
  already true for CORS. A misconfigured list now fails mutating requests
  with `403` instead of silently working over `SameSite=Lax` alone.
- No token, no per-request state, no header the frontend has to fetch and
  echo. If an HTML form ever appears in CAS itself (a consent screen in M2
  may be one), it is same-origin and passes the same check; no second
  mechanism is needed.
- The `Sec-Fetch-Site` header cannot be set by script, and `Origin` cannot
  be spoofed by a browser. A non-browser client can send anything, but it
  has no victim's cookie to attach.
