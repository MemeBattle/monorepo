# 13. Userinfo and RP-initiated logout

## Status

Accepted (2026-09-27), with [#745](https://github.com/MemeBattle/monorepo/issues/745).
Amends ADR 0009 (d): a retired signing key stays published for thirty days
after it stops signing, see (a).
Amended (2026-10-03) by ADR 0014, with [#746](https://github.com/MemeBattle/monorepo/issues/746):
"`name` with `profile`" in (c) holds for a full account; a guest has no
name to release, so its answer never carries one.
Amended (2026-10-04) by ADR 0017, with [#775](https://github.com/MemeBattle/monorepo/issues/775):
the endpoints are at `/oidc/userinfo` and `/oidc/end_session`, not at the
root; their CORS policies (e) and methods (h) are unchanged.

## Context

Discovery has advertised `{issuer}/userinfo` and `{issuer}/end_session`
since ADR 0009 (f); they are the last two endpoints of the minimal profile
PLAN lists. Both are defined by specifications that leave CAS choices:

- OpenID Connect Core §5.3 defines userinfo for the access token a client
  obtained through an OpenID authentication, but CAS's access tokens are
  audience-restricted to the client's resource server (ADR 0011 (b)), so
  userinfo cannot be the audience they name. Which tokens it takes, how it
  checks them, whether it notices a revoked grant, and which claims it
  answers with were open.
- A browser may call userinfo directly with a token it holds, while the
  root CORS policy is credentialed and lists the frontend alone (ADR 0004
  (e)). `/token` stays out of the browser (ADR 0011).
- OpenID Connect RP-Initiated Logout 1.0 makes `id_token_hint` RECOMMENDED
  and asks the OP to confirm with the user when it cannot tell the request
  is genuine. CAS has no confirmation screen, and a bare `GET` that ends
  the session is a logout CSRF — the gap ADR 0005 closed for
  `/api/logout`.
- An ID token lives ten minutes (ADR 0011 (c)); a client that logs out
  after an idle hour holds an expired one. The specification accepts it as a
  hint, but CAS verifies only against published keys, and the rotation
  procedure of ADR 0009 (d) dropped a key once its tokens had expired.
- Grants outlive the CAS session (ADR 0012 (g)), so what logout ends had to
  be said.

Until now nothing in CAS verified a JWS: resource servers verify tokens,
CAS only signs them.

## Decision

**(a) CAS verifies its own JWTs, strictly, against every published key.** A
token is accepted only as a three-segment compact JWS without padding, with
`alg: ES256`, exactly the expected `typ` (`at+jwt` at `/userinfo`, `JWT` for
a logout hint), a `kid` that is published, and a 64-byte `r || s` signature
that verifies under that key. `alg: none` and every other algorithm are
refused. Header members that point at a key other than the published ones
(`jku`, `jwk`, `x5u`, `x5c`) or ask for extensions (`crit`) are refused
rather than ignored (RFC 8725 §3.10, RFC 7515 §4.1.11). `typ` is what keeps
an ID token from being used as an access token and the other way round,
since one key signs both (RFC 8725 §3.11, RFC 9068 §4). Verification is the
same small function over OpenSSL as signing (ADR 0009 (g)); no JWT crate is
added. A refusal says which check failed to a test and a log line, never to
the caller, and never quotes the token.

Every published key verifies, so a rotation does not invalidate what the
old key signed while it is still published. Because an expired ID token
remains a valid logout hint (f), a retired key is kept published for as
long as a session its ID tokens could name may live: the session cap of
thirty days (ADR 0004 (c)), not the ten minutes of the tokens themselves.
Step 4 of the rotation in ADR 0009 (d) becomes "once every token the old key
signed has expired and thirty days have passed since it stopped signing".
After that, a hint signed by it is refused like any unverifiable one — a
page — and the user signs out from CAS's own dashboard. Keeping a public key
published longer costs nothing: it signs nothing, and a verifier that
trusts it only accepts what it signed while it was active.

**(b) `/userinfo` takes any unexpired CAS access token with `openid`,
whatever its `aud`.** Access tokens name the client's resource server (ADR
0011 (b)); userinfo is the OP's own resource, defined by Core §5.3 for the
token the client obtained, so its audience cannot be required to be CAS.
Requiring `openid` in `scope` ties the call to an OpenID authorization. A
userinfo audience added to every token was considered and rejected:
`openid` is mandatory for every authorization (ADR 0010 (b)), so every token
would carry it, the check would refuse nothing that `iss`, `typ` and
`openid` do not, and every resource server would pay for an `aud` array one
ticket after ADR 0011 fixed the token format. This is the one deliberate
exception to ADR 0011 (b)'s "a token minted for one resource is refused by
another", and it is limited to the OP's own endpoint.

`exp` is checked against the process clock with no leeway: the same clock
family issued it (ADR 0011 (e)). The account is read on every call, so the
claims are current and a deleted account's token is `invalid_token`.
Revocation of the grant is not checked: an access token is non-revocable by
design (ADR 0011 (a)), and a lookup per call to check it would make userinfo
the introspection endpoint that ADR deferred. A revoked grant's access token
reads userinfo for at most its remaining ten minutes, the same window every
resource server accepts.

**(c) Claims are released by the same rule as the ID token.** One function
decides it for both: `sub` and `account_type` always, `name` with `profile`,
`email` and `email_verified: false` with `email` when the account has an
address (ADR 0007, ADR 0011 (b)). The two cannot drift apart. `iss`, `aud`
and `amr` are not repeated: Core §5.3.2 requires only `sub`, and they
describe a token, not the account.

**(d) The token comes in the `Authorization: Bearer` header only, and errors
are RFC 6750's.** `GET` and `POST` are served, as Core §5.3.1 requires. The
scheme is case-insensitive and followed by one or more spaces and a
`token68` value (RFC 6750 §2.1). The query form of the token is refused by
omission because it leaks into logs and browser history (RFC 6750 §2.3 and
§5.3), and the form-body form is optional and would need a body
parser for nothing. No header, or a header of another scheme, is `401` with
a bare `WWW-Authenticate: Bearer`, since RFC 6750 §3.1 asks for no error
details when the client sent no Bearer credentials. Two headers, or a
`Bearer` header with an empty or non-`token68` value, is `400
invalid_request`. A token that fails (a) or (b) is `401 invalid_token`, a
token without `openid` is `403 insufficient_scope` with `scope="openid"`.
Each refusal carries the code in the challenge and, for a developer reading
the response, in a JSON body as `/token` does. A database failure is `503
temporarily_unavailable` or `500 server_error`, the codes `/token` borrows,
without a challenge since the token was not refused. Every answer is
`no-store`.

**(e) CORS: open and credential-less, on `/userinfo` only.** The route is
served outside the root CORS layer with a policy of its own: any origin,
`GET` and `POST`, the `Authorization` header, never
`Access-Control-Allow-Credentials`. That is safe because the endpoint reads
no cookie: a page on another origin can only use a token it already holds,
which it could send from anywhere else anyway. `/token` keeps the root
policy — a confidential client calls it from its backend (ADR 0011) — and so
does every other path, unknown ones included. The two policies cannot be
stacked: a CORS layer answers every preflight that reaches it itself, so a
route-level policy under the root one would never see its own preflights.
The transport root therefore applies each policy to its own router, outside
that router's panic handler, and wraps both in the request trace.

**(f) `/end_session` requires `id_token_hint` and ends the session only when
the hint's `sub` is the signed-in account.** Without a confirmation screen,
the hint is what tells a genuine request from a forged one. It is verified
as in (a): signature, `typ`, issuer, and an `aud` that is a registered
client. Its `exp` is not checked, as RP-Initiated Logout §2 allows: a client
logging out after its ten-minute ID token expired has nothing fresher. The
session the cookie names is looked up without renewing it, and it is ended
only when its account is the hint's `sub`. A session of another account is
left exactly as it was — not ended, not renewed, its cookie untouched — and
the request still redirects. So a page that sends its own account's hint,
or a hint it obtained some other way, cannot sign whoever is signed in to
CAS in this browser out. `client_id`, if sent, must be the hint's `aud`.
Requiring the hint is stricter than the specification's RECOMMENDED; every
client of CAS, ligretto first, holds an ID token for the session it logs
out. If one appears that does not, a confirmation screen is the remedy, not
dropping the check.

**(g) Validate everything, then act; pages before trust, redirects after.**
The rules run in a fixed order, and none of them changes anything: a
repeated `id_token_hint`, `client_id`, `post_logout_redirect_uri` or
`state` is refused first, as at `/authorize` (RFC 6749 §3.1); then the hint
is required and verified; `client_id` compared; the client looked up; and
`post_logout_redirect_uri`, if sent, compared byte for byte with the
client's registered list (ADR 0008 (c)). Every refusal renders CAS's own
error page — the one `/authorize` renders, now shared — and never redirects,
because until the address is known to be the client's, redirecting to it is
an open redirect (the reasoning of ADR 0010 (a)). A refused request ends no
session. Only a fully valid request touches the session, then redirects: to
the registered address with `state` when one was sent, or to the frontend's
root when no address was, where a browser without a session sees sign-in.
The request is idempotent: a browser with no session, or with a dead
cookie, gets the same redirect. `ui_locales`, `logout_hint` and any other
parameter are ignored.

**(h) `GET` and `POST`, as the specification requires.** RP-Initiated
Logout §2 requires both. `POST` takes an `application/x-www-form-urlencoded`
body of at most 8 KiB, read as `/token` reads its own; its query is not
read. The session cookie is `SameSite=Lax` (ADR 0004 (d)), so a `POST`
carries it from the same site — ligretto on a sibling subdomain of the same
registrable domain — but a cross-site form `POST` does not: it finds no
session, ends nothing, and still validates and redirects. Clients on
another site use `GET`, which is a top-level navigation and carries the
cookie; the README says so. `HEAD` is refused, as at `/authorize`, because
axum would otherwise serve it from the `GET` handler.

**(i) Logout ends the CAS session and nothing else.** Grants and refresh
tokens are not bound to the session (ADR 0012 (g)); the client that asked
for the logout drops its own tokens, and other clients keep theirs. When a
session was ended, the response clears the cookie and sends
`Clear-Site-Data: "cache", "storage"`, like `POST /api/logout` (ADR 0004
(i)). A dead or unreadable cookie is cleared too, since nothing live is
lost by forgetting it; another account's live cookie never is.

**(j) The request trace records the path, not the query.** The default
request span of the trace layer records the whole URI, so a
`GET /end_session` would have put a signed ID token — the account's name and
address inside — into every log line of that request. The span now records
the method, the path and the version, and nothing of the query, for every
route. ADR 0004 (j) already limited the trace to "method, path, status and
latency"; this makes the implementation say what the decision said. A test
through the middleware stack checks that neither the hint, nor any of its
segments, nor the `state` is captured.

## Consequences

- Every endpoint of PLAN's minimal profile is served; discovery needs no
  change.
- `ApiState` holds a userinfo service and an end-session service, both
  built from the published key set and `CAS_ISSUER`. The session service
  gains a lookup that writes nothing.
- The rotation procedure in the README and ADR 0009 (d) keeps a retired key
  published for thirty days after it stops signing.
- No migration, and no new query: the account, the client and the session
  lookups exist.
- A client on another site that logs out with a `POST` ends nothing (h).
  The integration guide (#751) must tell integrators to use `GET`, and to
  send `id_token_hint` always.
- A client may believe the user signed out of CAS when another account is
  signed in there (f); what the client controls is its own session, and
  ending one it does not own is the CSRF this prevents.
- Deferred: front- and back-channel logout and session management, which
  PLAN leaves out; token introspection (ADR 0011); a logout confirmation
  screen, should a client without an ID token appear.
