# 17. OIDC protocol endpoints under /oidc

## Status

Accepted (2026-10-04), with [#775](https://github.com/MemeBattle/monorepo/issues/775).
Amends ADR 0009 (e) and (f), ADR 0010 (c) and (g), ADR 0011 (g) and ADR
0013: the protocol endpoints those records place at the router root are
served under `/oidc`, see (a).

## Context

Until now every OpenID Connect endpoint was mounted at the router root, one
path each: `/authorize`, `/token`, `/userinfo`, `/end_session`,
`/jwks.json`, next to `/.well-known/openid-configuration`, `/health` and
`/openapi.json`. The first-party API lives under `/api`.

In production the SPA and CAS share one origin (frontend ADR 0001 (f)), so
whatever routes requests to CAS has to know which paths are CAS's. With the
endpoints at the root that is a list of paths that grows with every
endpoint, and the root is shared with the SPA's own routes. The endpoints
are also not "the API": `/api` means more than a prefix, and a reader of the
router could not tell the two kinds of path apart by their shape.

No client is integrated yet. Nothing outside this repository follows the
old paths, so this is the cheapest moment to move them.

What was open:

- Which prefix, and whether the endpoints could simply join `/api`.
- Whether the issuer, and with it the discovery URL, moves too.
- Whether the prefix is a router with layers of its own, or a spelling.
- What happens to the old paths.

## Decision

**(a) The five protocol endpoints are served under `/oidc`; discovery,
`/health` and `/openapi.json` stay at the root.** `/oidc/authorize`,
`/oidc/token`, `/oidc/userinfo`, `/oidc/end_session` and `/oidc/jwks.json`.
A proxy in front of CAS routes it by two prefixes, `/api` and `/oidc`, plus
the three fixed root paths, instead of by a list that grows; the rest of the
root is left to the SPA's routes; and "the first-party API" is exactly
`/api/*`.

**(b) `/oidc`, not `/api`.** `/api` is a contract, not only a prefix:
everything mounted there is behind the Fetch Metadata line (ADR 0005), is
`no-store` (ADR 0004 (i)) and answers in the `ApiError` shape, and a new
endpoint gets all of it by where it is mounted. The protocol endpoints would
each need an exception to that contract: a cross-site form
`POST /oidc/end_session` is supported (ADR 0013 (h)), `/oidc/userinfo` has an
open CORS policy of its own (ADR 0013 (e)), `/oidc/token` answers RFC 6749
errors, and the JWKS is `public, max-age=3600` (ADR 0009 (e)). A contract
with an exception per member is no longer one.

**(c) `/oidc`, not `/oauth2`.** Userinfo and RP-initiated logout are
OpenID Connect only, and the module that serves them is already `oidc`.

**(d) The issuer and the discovery URL do not move.** Discovery §4 fixes
`/.well-known/openid-configuration` relative to the issuer, so it stays at
the root, and `CAS_ISSUER` stays the bare base URL. `iss` in every token
and the issuer every client is configured with are unaffected; only the
endpoint URLs the document advertises change.

**(e) `/oidc` is a prefix, not a contract, and each route spells it out.**
The prefix has no layer and no fallback of its own: each endpoint keeps the
policy it had (its CORS, cache headers, cookie renewal, `HEAD` refusals),
and an unknown path under `/oidc` is the root's 404, like any unknown path
outside `/api`. The handlers declare their full path rather than the root
nesting an `/oidc` router, because nesting changes how fallbacks and layers
compose, `/oidc/userinfo` is assembled as a separate router for its CORS
policy (ADR 0013 (e)) and would need the prefix a second time, and the
contexts' own transport tests would address a path that is not the one on
the wire — which matters where the endpoint reads its own path, as
`/oidc/authorize` does for `return_to`.

**(f) No redirects or aliases from the old paths.** They answer the root's
404. No client is integrated, clients take the endpoints from discovery,
and an alias would be a second set of paths to keep consistent in CORS,
caching and the OpenAPI description.

**(g) The session cookie stays `Path=/`.** It is read under `/api` and by
`/oidc/authorize` and `/oidc/end_session`; narrowing it to either prefix
would lose the other.

**(h) `return_to` is `/oidc/authorize?…`, and the frontend's origin routes
`/oidc` to CAS.** `return_to` is the request's own path and query, so it
follows the endpoint by construction; the frontend navigates to it on its
own origin once the ceremony is done (#748). In development the vite proxy
forwards `/oidc` next to `/api`; in production the same rule that routes
`/api` routes `/oidc`.

## Consequences

- The discovery document changes once. ADR 0009 (f) kept it stable across
  the milestone; this is the one deliberate break, made before any client
  exists. A cached copy is good for an hour (ADR 0009 (e)), which matters
  only after the first deployment.
- `apps/cas/openapi.json` lists the endpoints under their new paths.
- The integration guide (#751) and the reference client test (#750) take
  the endpoints from discovery, and the frontend (#748) follows `return_to`;
  none of them names a path of its own.
- Earlier ADRs name the endpoints by their old paths; read them with the
  prefix. The migrations' comments do too and stay, being immutable.
- A new protocol endpoint goes under `/oidc` by writing the prefix into its
  path; a new first-party endpoint goes under `/api` and gets its contract
  by being mounted there.
