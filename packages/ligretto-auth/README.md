# @memebattle/ligretto-auth

The server side of talking to [CAS](../../apps/cas), the identity provider:
the types and HTTP client generated from its OpenAPI description, and
`verifyAccessToken`, which a resource server uses to verify a bearer token
without asking CAS anything.

**Server-only.** The package verifies tokens and, from the confidential client
on, holds a client secret. Nothing here belongs in a browser bundle: an
application's frontend talks to its own backend, and that backend talks to CAS
([INTEGRATION.md §1](../../apps/cas/docs/INTEGRATION.md)). The one exception is
`@memebattle/ligretto-auth/contract`, which is `export type` declarations and
no code at all — the shapes [the handlers](#the-http-handlers) answer, so a
frontend types its calls against the declaration the backend answers from.

**Runtime-agnostic.** Web standards only — `fetch`, WebCrypto,
`Request`/`Response` — and no framework imports, so the same source runs on
Cloudflare Workers and on Node unchanged. `src/` uses no Node API and the
package pulls in no Node types; only the dev-time generator in `scripts/` runs
under Node.

## Verifying an access token

```ts
import { verifyAccessToken } from '@memebattle/ligretto-auth'

const claims = await verifyAccessToken(token, {
  issuer: 'https://cas.mems.fun',
  audience: 'https://ligretto.mems.fun/api',
})
```

It runs the check of
[INTEGRATION.md §6](../../apps/cas/docs/INTEGRATION.md) in its order:

1. `typ` is `at+jwt` — an ID token says `JWT`, and one key signs both, so this
   is the only check that tells the two apart (ADR 0011 (a)).
2. `alg` is one the discovery document publishes (ES256), never the token's own
   choice — which is what refuses `none`.
3. The key is the published one with the token's `kid`. When the `kid` is
   unknown the JWKS is read again, once: a rotated key is published before it
   signs anything (ADR 0009 (d)). The cached keys are replaced only once a
   usable answer has arrived, and a second unknown `kid` within 30 seconds is
   answered from the cache — an unknown `kid` is reason to ask for new keys,
   not reason to drop the ones open sessions verify against.
4. The signature matches that key.
5. `iss` is the configured issuer, `aud` is this resource server's audience
   (not a client id, ADR 0011 (b)), and `exp` — a required numeric claim — is
   in the future, with no clock leeway.

It resolves with `sub`, `client_id`, `scope`, `amr`, `account_type`, `iss`,
`aud`, `exp`, `iat` and `jti`. A guest is a guest from `account_type` alone;
there is nothing to look up.

A refusal is an `InvalidTokenError` whose `code` names the failed check:
`malformed`, `wrong_typ`, `alg_not_allowed`, `unknown_kid`,
`invalid_signature`, `wrong_issuer`, `wrong_audience`, `invalid_exp`,
`expired`. A `DiscoveryError` (`discovery_unavailable`, `issuer_mismatch`,
`malformed_metadata`, `unusable_key`) means the provider's metadata could not
be read, could not be trusted, or says nothing a verification can be run from —
the token was never judged. Both are known failures with stable codes, so a
caller answers with a status of its own rather than letting them surface as an
unhandled error.

## The confidential client

`createCasClient` is the protocol half: what a backend sends CAS and what it
gets back, with every endpoint taken from discovery and every ID token
validated before anything in it is read.

```ts
import { createCasClient } from '@memebattle/ligretto-auth'

const cas = createCasClient({
  issuer: 'https://cas.mems.fun',
  clientId: 'ligretto',
  clientSecret: process.env.CAS_CLIENT_SECRET,
  redirectUri: 'https://ligretto.mems.fun/auth/callback',
  postLogoutRedirectUri: 'https://ligretto.mems.fun/',
})
```

- `authorizationRequest({ scope?, idTokenHint?, prompt? })` builds the
  request of [§4](../../apps/cas/docs/INTEGRATION.md): PKCE `S256` over
  WebCrypto, a `state` and a `nonce` of 32 random bytes each, `scope`
  defaulting to the client's (`openid profile`), and `id_token_hint` or
  `prompt` only when given. `prompt` takes `none` and nothing else: CAS
  answers every other value `invalid_request`, so the type refuses what the
  server would. It resolves with the URL and the three values the callback is
  checked with — keep them for that browser.
- `exchangeCode({ code, codeVerifier, nonce })` redeems the code (§5), and
  `refresh(refreshToken)` rotates the grant (§7). Both resolve with the
  tokens, the validated claims and a profile snapshot; `scope` is read from
  the answer, never assumed from the request.
- `guestGrant({ scope? })` mints a guest with
  `urn:memebattle:oauth:grant-type:guest` (§8), with no browser involved.
  `scope` goes on the wire only when given: CAS defaults a guest to `openid`,
  and `profile` would release nothing.
- `endSessionUrl({ idTokenHint, state? })` builds the logout navigation of
  §11. The application ends its own session itself.

Every token call is a form `POST` to the document's `token_endpoint`,
authenticated with `client_secret_basic` —
`base64(urlencode(id) ":" urlencode(secret))`, each half percent-encoded
because CAS form-decodes each half strictly.

The profile snapshot is `{ sub, accountType, displayName, avatarUrl }`, read
off the ID token's claims: `name` and the standard `picture` claim, each
`null` when absent. CAS releases no `picture` today; mapping it now means
nothing here changes when it does.

A refusal CAS declared is a `TokenEndpointError` carrying the `code` the
OpenAPI description lists for the token endpoint (`invalid_grant`,
`invalid_client`, `rate_limit_exceeded`, `temporarily_unavailable`, …), its
`status`, the response's `headers` and `retryAfterSeconds` when `Retry-After`
prescribes one. An ID token that fails a check is an `InvalidIdTokenError`
whose `code` names it: `malformed`, `wrong_typ`, `alg_not_allowed`,
`unknown_kid`, `invalid_signature`, `wrong_issuer`, `wrong_audience`,
`invalid_exp`, `expired`, `nonce_mismatch`, `missing_claims`. It is a class
of its own rather than an `InvalidTokenError`: the audiences differ — a
client id against a resource server's audience — and a caller must tell a
refused sign-in from a refused bearer token. Anything outside the contract
arrives as the transport's `ApiError`, a CAS that could not be reached at all
included (`unreachable`).

A `refresh` is the one call that refuses an ID token differently. CAS retires
the presented refresh token the moment it answers `200` (ADR 0012 (b)), so a
refusal that comes after that answer arrives as an `UnusableGrantError`
carrying the rotated `grant` — the tokens, no account snapshot — with the
`InvalidIdTokenError` or `DiscoveryError` as its `cause`. Record the grant
before answering the failure: dropping it leaves the caller holding a token
CAS has spent, and presenting that one again is read as theft and revokes the
whole grant. `refreshSession` below records it.

## Sessions

`SessionStore` is a port: this package states the shape and the concurrency
contract, each runtime brings the implementation.
`createInMemorySessionStore()` is the one for tests; a Postgres one lives
with the application's own schema. It holds sessions (the grant's tokens and
expiries, and the account snapshot) and the sign-ins in flight, keyed by
`state` with an hour's TTL — the life of the upgrade session CAS opens
(ADR 0015 (b)). `takePendingRequest` consumes: an expired request answers
`undefined` and is not swept in the background.

**The session-write rule.** Every read-then-write of an existing session runs
inside `withSessionLock` on that session's id, and re-reads the session
inside the lock. It is what keeps one refresh in flight per grant (§7) and
what stops two writers deciding about one session at once — a refresh that
found the grant over must not delete a sign-in that completed while it waited
for CAS. The lock is keyed by id, not by row, so a writer deciding about a
session that has been deleted takes it too.

The functions over a `{ client, store, now? }` context carry the rules of §7
and §9:

- `refreshSession(ctx, sessionId, { force?, minValidityMs? })` refreshes
  inside the lock, skipping while the access token has more than
  `minValidityMs` (a minute by default) left — which is what collapses two
  concurrent callers into one token request. The rotated refresh token is
  persisted before the call resolves, so the caller never holds an access
  token whose refresh token was not stored. `invalid_grant` means the grant
  is over: the session is deleted and the typed error rethrown. An
  `UnusableGrantError` means CAS rotated and then answered an ID token this
  client cannot accept: the rotated tokens are written — the snapshot is not,
  since the claims they came in were refused — and the error rethrown. Their
  access token is stored already expired, so the next ordinary call refreshes
  for real instead of handing out a bundle this client refused. Every other
  failure leaves the session as it was.
- `beginSignIn(ctx, { sessionId?, scope?, prompt? })` starts a sign-in, and
  an upgrade when a session is named: it force-refreshes first and hints with
  the **newly issued** ID token, always, because CAS checks the hint's `exp`
  strictly and a stored ID token is never reused (ADR 0015 (c)). The pending
  request records the session's id and the `sub` it held.
- `completeSignIn(ctx, { code, state })` consumes the pending request,
  redeems the code and writes the session. **Its precondition:** the caller
  has already checked that the callback arrived on the browser that started
  the sign-in. §4 requires `state` compared with the value stored _for this
  browser_; the store proves only that the state exists, so the cookie that
  binds it to a browser belongs to the HTTP layer above this package. The
  session it returns always carries a **new id**, and the session that
  started the sign-in is deleted — the upgrade of the very same account
  included, because the grant that comes back is a full account's and an id
  handed out while the account was a guest must not reach it (ADR 0015 names
  session fixation as the upgrade's threat, and CAS's own revocation cannot
  reach a row of this store). Install the id the result carries. When the
  `sub` that comes back is not the one the sign-in started from, the result
  reports `previousSub` and the new session carries nothing of the old one —
  reported, never merged (§9). The report comes from the snapshot taken at
  `beginSignIn`, so it survives the old session having been deleted
  meanwhile, which an upgrade makes routine: it revokes the guest's grants.
- `mintGuest(ctx, { scope? })` mints a guest and persists its session.

`grantEndsAt` is computed as 30 days from the grant's creation and never
moved by a refresh (ADR 0012 (g)); CAS does not transmit it.

## The HTTP handlers

`createAuthHandlers` is the HTTP half: four `(Request) => Promise<Response>`
functions, so Hono, a bare Worker and an Adonis adapter mount the same
handler. No framework is imported, and none is assumed.

```ts
import { createAuthHandlers, createCasClient } from '@memebattle/ligretto-auth'

const auth = createAuthHandlers({
  client: createCasClient({ ... }),
  store, // a SessionStore
  transport: 'cookie', // or 'bearer'
  appUrl: 'https://ligretto.mems.fun/',
})
```

- **`me`** keeps a usable access token in front of the browser. No session
  presented means a guest is minted and installed; a session presented is
  refreshed when its access token has less than a minute left, and answered
  from the store otherwise. The answer is a `MeResponse`:
  `{ user: { sub, accountType, name, avatarUrl }, accessToken, expiresAt,
signedOut }`, with `expiresAt` in epoch milliseconds. A grant that has
  ended (`invalid_grant`) or an id the store does not hold is answered with a
  new guest rather than an error — the user is not blocked — and `signedOut`
  is `true` when what the id named was a **full** account, so the UI can
  offer a sign-in instead of silently showing a guest. A session is handed
  over only by the answer that **created** it; an answer for a session the
  browser already presented installs nothing.
- **`sign-in`** stores the sign-in in flight and sends the browser to CAS.
  With a session it force-refreshes and, for a **guest**, hints with the
  freshly issued ID token (§9). If that session turns out to be gone, the
  sign-in starts again without one: the user asked to sign in either way.
- **`callback`** compares the query's `state` with the cookie this browser
  holds, handles an `error` CAS sent, checks that a code is actually there,
  redeems it, installs the new session and redirects to `appUrl`. A `sub`
  that is not the one the sign-in started from is reported as
  `?previous_sub=<sub>` on that redirect, never merged (§9).
- **`logout`** ends this application's session and sends the browser to
  CAS's `end_session` with the `id_token_hint` and the registered
  `post_logout_redirect_uri` (§11). It also takes the `state` cookie back, so
  a sign-in the user left in flight cannot complete afterwards and sign them
  back in. Nothing to end is still a logout: the browser goes back to
  `appUrl`.

`appUrl` is parsed at construction, as `cookieName` is checked there: a
relative value would pass every route but the callback's success path and fail
only at the end of a real sign-in, with the session already written.

### The two transports

One option decides where the session id travels; everything else is shared.

**`cookie`** — the id lives in `__Host-ligretto_session`
(`HttpOnly; Secure; Path=/; SameSite=Lax`), the name overridable with
`cookieName` as long as it keeps the `__Host-` prefix, which is what makes
the browser enforce `Secure`, `Path=/` and host-only. The frontend navigates
to `sign-in` and `logout` top-level and gets a `302`. `__Host-` requires
`Secure`, and Chrome and Firefox accept `Secure` cookies from
`http://localhost`, so local development needs no accommodation.

**`bearer`** — the id travels in `Authorization: Bearer <session id>` on
`me`, `sign-in` and `logout`, with the scheme compared case-insensitively
(RFC 6750 §2.1, ADR 0013 (d)) and the id passed through byte for byte. A
navigation cannot set a header, so the frontend **fetches** `sign-in` and
`logout` and gets `200` with a `NavigationResponse` `{ url }` to navigate to
itself. `me` hands an id back as `sessionId` in its body only when it minted
the session, and the callback — the one navigation CAS makes to us — hands
one over in the redirect's **fragment**, `#session_id=<id>`, which browsers
never send to a server and never write to a log. The id is in no query
parameter anywhere.

Both transports use the same `state` cookie, `__Host-ligretto_auth_state`,
for the browser binding §4 demands: `completeSignIn` proves only that a
`state` exists in a store shared by every browser, so without the cookie a
`state` captured from one browser could be completed on another. The
callback is a top-level GET navigation to the handlers' own origin, where a
host-only `Lax` cookie is sent, so this works in both. In `bearer` mode the
`Set-Cookie` rides the `sign-in` **fetch** answer, so that fetch must be
credentialed (`credentials: 'include'`, or same-origin). The cookie is
cleared when a sign-in completes and left in place on every refusal — a
stray callback must not be able to kill a sign-in the browser legitimately
has in flight.

### The answers

`@memebattle/ligretto-auth/contract` is a second entry holding `MeResponse`,
`NavigationResponse`, `AuthUser`, `AuthErrorCode` and `AuthErrorResponse` as
`export type` declarations and nothing else, so a browser bundle can import
it: it is erased at build time and pulls none of the server-only code with
it. The same types are re-exported from the main entry for a backend.

Every known failure is a 4xx or a 503 carrying one of five stable codes;
`500` is only ever the host's, for what is genuinely unhandled.

| Status | `error`               | When                                                                                                                                                                            |
| -----: | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  `400` | `unknown_state`       | The callback's `state` does not match this browser's cookie, or names no sign-in this backend still holds (`CallbackStateError`).                                               |
|  `400` | `sign_in_failed`      | The callback carries no code, the code was spent (`invalid_grant`), or the user said no (`access_denied`) — the code CAS named is in `casError`.                                |
|  `429` | `rate_limit_exceeded` | CAS is rate-limiting this client; `Retry-After` echoes the delay it prescribed.                                                                                                 |
|  `503` | `cas_unavailable`     | Transient: `temporarily_unavailable`, `server_error`, `internal_error`, any `5xx`, an `ApiError` (a proxy's page, or CAS unreachable), a refused ID token, unreadable metadata. |
|  `503` | `cas_rejected`        | Permanent until an operator acts: `invalid_client`, `unauthorized_client`, `invalid_scope`, `invalid_request`, `unsupported_grant_type`, `unsupported_response_type`.           |

The same three buckets sort what either CAS endpoint sent, because the same
faults reach both: the token endpoint's codes (RFC 6749 §5.2) and the `error`
the authorization endpoint redirects back with (§4.1.2.1) are classified by
one rule each, not by whether CAS is away. A scope the client is not
registered for comes back from the authorization endpoint on **every**
sign-in, so reporting it as `sign_in_failed` would bury a configuration fault
among users cancelling.

The split between the two `503`s is the operators' signal: CAS being away is
worth retrying, CAS refusing this client's registration or request shape is
not. `ApiError` belongs to `cas_unavailable` because it means CAS could not
be used — something answered **in its place** and outside its contract (a
proxy's HTML error page, an error body carrying no code, a `2xx` that is not
JSON: `casError` is `unknown`), or nothing answered at all because the
network, DNS or TLS failed (`casError` is `unreachable`). Both are the
provider being unusable, not the provider refusing, and neither may reach the
host as a 500: an outage that hits the discovery document and one that hits
the token endpoint are one outage and answer alike.

`invalid_grant` and an unknown session are the only failures the routes read
differently from one another, because what they mean depends on what was
being attempted: on `me` an ended grant is a new guest, on `sign-in` it is a
plain sign-in, at the callback it is a refused code.

## Endpoints come from the issuer

No path is hard-coded. The discovery document is read at
`{issuer}/.well-known/openid-configuration`, appended to the **full** configured
issuer, so an issuer that carries a path keeps it; the document's own `issuer`
must equal the configured one byte for byte before it is trusted (ADR 0009 (e));
and every other endpoint, the JWKS included, is the one the document advertises
(ADR 0017). The document and the JWKS are cached for as long as their
`Cache-Control: max-age` says, and an answer without one is not cached at all.
Only metadata this package can work from is cached: a body that is no JSON
object at all, a document that advertises no `jwks_uri`, no signing algorithms
or none of the three endpoints that are sent to (`authorization_endpoint`,
`token_endpoint`, `end_session_endpoint`) and a key set that is not one are
refused as `malformed_metadata`, and a key set holding
material WebCrypto will not take for the algorithm it names is refused as
`unusable_key`. None of them is kept, so the next verification reads what the
provider serves now instead of answering from a poisoned cache for an hour.

## Generated code

`src/generated/` is written by the generator and never edited by hand — kubb
empties the whole directory on every run, so nothing hand-written may live
there, test files included.

```sh
pnpm run --filter @memebattle/ligretto-auth generate:api
```

That runs kubb over [`apps/cas/openapi.json`](../../apps/cas/openapi.json),
filtered to the `/oidc/` and `/.well-known/` paths — the protocol surface; the
`/api/` JSON API is the CAS dashboard's — and then
`scripts/generate-error-codes.mjs`, which writes `src/generated/error-codes.ts`
from the `x-error-codes` extension. The extension is the one place the codes
live, whatever the response body (ADR 0016 (i)): the `302` of `/oidc/authorize`
carries its ten codes in the redirect's `error` parameter and has no body, and
the `400`/`503` of the navigation endpoints are HTML pages.

An integer is generated as a `number`: kubb maps `format: int64` to `bigint` by
default, which is exact for a 64-bit identifier but is not what `JSON.parse`
produces, so `kubb.config.ts` sets `integerType: 'number'` and the token
endpoint's `expires_in` has the type the transport really delivers.

The output is committed, and it may lag behind the description: nothing fails
because `apps/cas/openapi.json` changed and nobody regenerated.
`ligretto-auth-pr.yml` regenerates before the type check and the tests, so CI
fails only when the package stops compiling or its tests stop passing against
the description as it is in the commit.

The transport the generated operations call is `src/client.ts`. It appends
every path of the description to the `baseUrl` of `createClient({ baseUrl })`,
so a base URL that carries a path keeps it; follows no redirect
(`redirect: 'manual'`; a 3xx is thrown); passes caller headers through, each
winning over the content type the body encoding would set, whatever its casing;
sends a string body verbatim as `application/x-www-form-urlencoded` (the token
endpoint's form body, which must not be quoted into JSON) and any other body as
JSON. An error CAS answered with — a 4xx or a 5xx whose body carries a code —
comes back as a value whose `code` is typed from the codes the operation
declares and whose `headers` are the response's, so a caller reads the
`Retry-After` a `429` or a `503` prescribes. Everything outside the contract is
thrown as an `ApiError` carrying the `status` and `headers`: a redirect, an
error response whose body carries no code (a proxy's page, not CAS), a 2xx
whose body is not JSON, and a `fetch` that rejected, which has no response
behind it and so carries the code `unreachable` and the status `0`, with the
rejection as its `cause`.

The generated operations take a `throwOnError` option and a `ThrowOnError` type
parameter: kubb's plugin-client prints both into every operation and offers no
way to leave them out, only their default, which `kubb.config.ts` sets to
`false`. The transport does not read them, and `Options` types the option as
`never`, so a caller cannot ask for a throw that would never happen.

## The integration test

`tests/integration/` is this package's reference run against a **real CAS**, as
[`apps/cas/tests/reference_client`](../../apps/cas/tests/reference_client) is
CAS's own and [`apps/cas-frontend/e2e`](../../apps/cas-frontend/e2e) is the
frontend's. Nothing is stubbed: CAS is the built binary on its database, the
client is the one `seed.sh` registered, the four handlers are served over a
real local socket and driven with real `fetch`, and the sign-in ceremonies are
performed with a software passkey against CAS's own `/api`.

Three tests against CAS, each one a sequential story:

1. **Discovery parity** — the document CAS serves equals the one
   `src/test-support/cas.ts` serves the unit suite, modulo the issuer. This is
   what keeps the stub honest: a member or value CAS adds, drops or changes
   fails here until the stub catches up.
2. **The guest and its tokens** — a guest minted on the first `me`,
   `verifyAccessToken` accepting that access token and refusing the grant's ID
   token (`wrong_typ`), a forced refresh rotating the grant, and a replayed
   refresh token answered `invalid_grant` with the whole grant revoked, after
   which `me` mints a new guest.
3. **Sign-in, upgrade, replacement and logout** — a guest upgraded through
   `/create-account` keeping its `sub`, a sign-in to an existing account
   replacing the session and reporting `previous_sub`, a full account's revoked
   grant reported as `signedOut: true`, and a logout that reaches CAS's
   `end_session`, after which the CAS session cookie kept aside beforehand is
   refused — the session itself ended, not only the browser's copy of it.

`server.spec.ts` next to them pins the fixture's own failure path: a handler
that throws is answered `500` with its failure rather than left unanswered for
a test to report as a timeout.

`ligretto-auth-pr.yml` runs it on every pull request touching this package or
`apps/cas`. Locally, every line from the repository root:

```sh
docker compose -f apps/cas/docker-compose.yml up -d --wait
cargo run -p cas --bin cas-migrate
packages/ligretto-auth/tests/integration/seed.sh   # once per database
cargo run -p cas &
pnpm exec wait-on --timeout 60000 http-get://127.0.0.1:3000/health
LIGRETTO_AUTH_CLIENT_SECRET="$(cat packages/ligretto-auth/tests/integration/.client-secret)" \
  pnpm run --filter @memebattle/ligretto-auth test:integration
```

`seed.sh` registers `ligretto-auth-test` — confidential, first-party,
guest-login-allowed, scopes `openid profile email`, audience
`ligretto-auth-test`, callback on the reserved `.test` TLD — and writes the
secret CAS printed once to `tests/integration/.client-secret` (gitignored, mode
600). It is not idempotent: a second run says "already exists", which is the
signal that the client is there, and exits zero when the secret is still next
to it. That is the one failure it reads as success, so an unreachable database
is still reported as a failure. `CAS_ISSUER` overrides `http://localhost:3000`.

## Scripts

- `pnpm run --filter @memebattle/ligretto-auth ts-check`
- `pnpm run --filter @memebattle/ligretto-auth test` / `test:ci`
- `pnpm run --filter @memebattle/ligretto-auth build` — the CommonJS build in
  `build/` that a plain-Node consumer loads (see [Decisions](#decisions));
  only an image build needs it.
- `pnpm run --filter @memebattle/ligretto-auth test:integration`
- `pnpm run --filter @memebattle/ligretto-auth generate:api`

## Decisions

Recorded here rather than in an ADR directory, which no package in this
repository keeps:

- Web standards and server-only, as above; no Node API in `src/`, no
  `@types/node`, no framework import.
- `src/generated/` is generator-owned and committed; CI type-checks and tests
  against freshly generated output rather than demanding the committed copy be
  current.
- An error CAS answered with is a value, never an exception; what is outside
  the contract throws, and always as an `ApiError` — the network included,
  since a caller mapping known failures to statuses of its own has nothing to
  recognise `fetch`'s own `TypeError` by and would answer a routine outage
  with a 500.
- The transport lives in this package rather than being copied per consumer,
  and generated files are never edited: a call that must reach a discovered URL
  goes through `atUrl`, which replaces the request's URL and nothing else.
- Verification failures are typed errors with stable, distinct codes, and a
  provider that cannot be reached or trusted is a different error class from a
  refused token.
- The confidential client is hand-written over the generated transport; no
  `openid-client`. Its types are not the description's, and
  `apps/cas/tests/reference_client` already proved CAS against a real
  library.
- Errors as values stays a transport-layer rule: the client's methods throw
  typed errors, as `verifyAccessToken` already does, so a handler maps a code
  to a status without matching on strings.
- ID-token refusals are a class of their own, not `InvalidTokenError`: the
  audiences differ, and `aud` alone cannot tell the two token kinds apart
  when a resource server's audience is its client id — the `typ` check is the
  separator.
- The `SessionStore` port lives here; implementations live with their
  runtime. `withSessionLock` is part of the port, not of an implementation:
  it is the concurrency contract §7 demands, and it locks ids rather than
  rows so it also serialises writers deciding about a session that is gone.
- The session rules of §7 and §9 live here once rather than in every
  consumer: the rotated refresh token persisted before the new access token
  is used, the session deleted on `invalid_grant`, the force-refresh before
  an upgrade hint, and a `sub` mismatch reported rather than merged.
- A rotation CAS has made is never dropped: a `refresh` whose ID token is
  refused leaves with the rotated tokens (`UnusableGrantError`) and
  `refreshSession` writes them, because the token the session presented is
  spent either way and presenting it again would cost the whole grant. It
  writes them as a spent access token, not a fresh session: tokens that
  arrived with a refused ID token are stored to be presented, never to be
  handed out.
- A sign-in that completes retires the id it started from, the upgrade of the
  same account included: the session is the full account's afterwards, so the
  guest's id does not carry over (ADR 0015, session fixation). `sub` is what
  stays stable across an upgrade, and it is what application data is keyed
  on.
- The mismatch is compared against the `sub` snapshot taken at
  `beginSignIn`, carried in the pending request, so the report survives the
  initiating session's deletion — routine after an upgrade, which revokes the
  guest's grants.
- `completeSignIn` presumes browser-bound `state`: the shared store proves
  existence, not origin, and the cookie comparison of §4 is the HTTP layer's.
- `grantEndsAt` is computed client-side as 30 days from the grant's creation
  (ADR 0012 (g)); CAS does not transmit it.
- The handlers are `(Request) => Promise<Response>` and nothing else: the
  framework is the consumer's, and `#814` mounts the same four functions it
  would mount on a bare Worker.
- The `state` cookie is the browser binding of §4 in **both** transports,
  not only the cookie one: `completeSignIn` proves a `state` exists in a
  store every browser shares, which is not the same as it belonging to this
  browser. In `bearer` mode it rides the `sign-in` fetch answer, so that
  fetch must be credentialed; a genuinely cross-site consumer would fail
  closed at the state check, which is the correct direction to fail.
- It is cleared when a sign-in completes and when the user logs out, never on
  a refusal: clearing it on a stray or malformed callback would let one tab's
  junk request end a sign-in another tab legitimately has in flight, and it
  expires with the pending request anyway. Logout is the deliberate
  exception — a sign-in left in flight in a CAS tab would otherwise complete
  afterwards and hand the user a brand-new session, undoing a logout they
  were told had happened. The pending request is left to its own TTL;
  nothing is swept on the request path.
- `me` hands a session over only on the answer that **created** one — the
  cookie installed, or `sessionId` in the body. An answer for a session the
  browser presented hands nothing back: it would gain nothing (the cookie's
  `Max-Age` counts to `grantEndsAt` plus the grace whenever it is written,
  and a refresh never moves `grantEndsAt`) and it would cost correctness,
  because responses are not delivered in the order they were produced. A
  `me` from a refresh timer in one tab, arriving after a callback in another
  has retired the session it names, would put the retired id back in use and
  leave the next `me` replacing the signed-in account with a guest.
- `appUrl` is parsed once at construction, like the `__Host-` check on
  `cookieName`: its only use is the callback redirect, so a relative value
  would mount cleanly, serve `me`, `sign-in` and `logout` correctly, and
  fail for the first user to finish a sign-in — as a 500, with the session
  already saved and never handed over. A mounting mistake belongs to the
  deploy.
- `bearer` keeps the session id out of every URL. It is a long-lived
  reusable credential and an abandoned sign-in does not retire it, so a copy
  left in a query string or a server log stays usable: the header carries it
  on calls (scheme case-insensitive per RFC 6750 §2.1, ADR 0013 (d); the id
  itself case-sensitive), the callback redirect's fragment hands a new one
  over, and `sign-in`/`logout` answer JSON `{ url }` rather than a `302` a
  fetch could not usefully follow.
- The session cookie outlives its grant by `SESSION_COOKIE_GRACE_MS`, seven
  days. A cookie that died at `grantEndsAt` would stop being sent, so
  an ordinary grant expiry would be indistinguishable from a new visitor and
  `signedOut` could never be reported. Within the grace the stale id is
  presented once, refused `invalid_grant`, and reported. **A store's cleanup
  job must therefore keep session rows until
  `grantEndsAt + SESSION_COOKIE_GRACE_MS`** — the report needs the row to
  refuse the id against (a constraint on the Postgres store of `#813`).
  Past the grace the user is a plain new visitor, which no cookie lifetime
  can avoid.
- `signedOut` comes from an advisory read of the session taken _before_ the
  refresh and outside the lock. It decides nothing but the report, so the
  worst a race costs is one mis-report, and reading it under the lock would
  mean a second round of locking on every `me`.
- `beginSignIn` sends the `id_token_hint` only for a guest's session: §9's
  hint exists to start an upgrade, and CAS ignores one naming a full
  account. The force-refresh and the `sub` snapshot stay for every session,
  so signing in again still retires the old session and still reports a
  `sub` switch.
- Logout's read, URL build and delete all run inside the session's lock
  (`endSession`), and the URL is built from the ID token read there, before
  the delete. CAS's logout revokes no grant (§11), so a refresh that was
  waiting on CAS and wrote the session back after the delete would leave a
  **working** session behind a logout the user was told had happened. A
  `DiscoveryError` leaves the session in place, so a full logout can be
  retried.
- Two `503` codes, not one: `cas_unavailable` is transient and worth a
  retry, `cas_rejected` is CAS refusing this client's registration or
  request shape and stays broken until an operator acts. `ApiError` is
  `cas_unavailable` — something answered in CAS's place, outside its
  contract, or nothing answered at all.
- The `error` of a callback is classified by the same rule as a token
  endpoint code, not by "away or not": RFC 6749 §4.1.2.1 sends the
  registration-fault family (`unauthorized_client`, `invalid_scope`,
  `invalid_request`, `unsupported_response_type`) through the authorization
  endpoint too, and answering those `sign_in_failed` would make a deployment
  that fails every sign-in look like users cancelling. `access_denied` and a
  code this package does not know stay
  `sign_in_failed`: the user said no, which is not an operator's problem.
- The callback checks for a code itself, before `completeSignIn`, because
  that function consumes the pending request _before_ it redeems the code: a
  callback with none would spend a sign-in the browser could still have
  completed, and send a junk exchange to CAS.
- Two shapes behind one exports map, the `@memebattle/ligretto-shared` one:
  TypeScript source under `types`, `development` and `default`, a CommonJS
  `tsc` build under `node`. The first runtime consumer, the gameplay
  backend's image (`#815`), runs plain `node build/index.js`, and Node will
  not type-strip `.ts` inside `node_modules`, so a runtime consumer needs an
  artefact; `tsx`, vitest and every bundler keep loading the source, and
  `types` first means no type check ever waits for a build. The build is
  CommonJS — hence no `"type": "module"` — and `module: nodenext` is what
  lets it `require()` ESM-only `jose`, which Node 24 supports. The
  `./contract` entry is built alongside the rest but stays types alone, so a
  browser bundle gets no code from it.
- The integration suite lives in `tests/integration/` behind a vitest config
  and a tsconfig project of its own. `test:ci` keeps selecting `src/**` alone,
  so it stays hermetic: the root `pnpm test:ci` runs every package in parallel
  and must not need CAS. `tsconfig.json` keeps checking `src` against web
  standards alone, so the boundary above is checked rather than promised while
  the tests may use `node:http`.
- The handlers are driven **over HTTP**, from a test-only `node:http` adapter
  on `127.0.0.1`, with a cookie jar over real `fetch` in front of it. The
  status line, the two `Set-Cookie`s a callback sends and the cookies a browser
  presents back all go through an HTTP stack rather than being read off a
  `Response` in the same process. `node:http` is typed by a local
  `declare module` under `tests/`, never by `@types/node`.
- The software passkey is this suite's own, mirroring
  `apps/cas/src/testing/soft_passkey.rs`: what it needs of CBOR and ASN.1 is
  four encodings and one DER signature, which does not earn a test-only
  dependency under the repository's supply-chain policy.
- A refresh is forced by stamping the stored access token expired — the store
  belongs to the test — never by faking CAS's clock or waiting a token out, so
  nothing in the suite sleeps.
- Only the `cookie` transport is exercised end to end. The transports differ on
  this package's side alone and both are unit-tested; the protocol toward CAS
  is identical, so a `bearer` copy of the suite would re-prove CAS, not the
  transport.
- The CI client is registered per job by `tests/integration/seed.sh`, never
  seeded by a migration (CAS ADR 0008), and the discovery-parity test is what
  keeps `src/test-support/cas.ts` — and so every unit spec built on it — in
  step with the CAS the package actually talks to.

Background: [INTEGRATION.md](../../apps/cas/docs/INTEGRATION.md) §2–§9 and
§11, and the CAS ADRs
[0009](../../apps/cas/docs/adr/0009-signing-key-and-discovery.md),
[0010](../../apps/cas/docs/adr/0010-authorization-endpoint.md),
[0011](../../apps/cas/docs/adr/0011-token-endpoint-and-access-tokens.md),
[0012](../../apps/cas/docs/adr/0012-refresh-token-rotation.md),
[0013](../../apps/cas/docs/adr/0013-userinfo-and-rp-initiated-logout.md),
[0014](../../apps/cas/docs/adr/0014-guest-accounts-and-the-guest-grant.md),
[0015](../../apps/cas/docs/adr/0015-guest-upgrade.md),
[0016](../../apps/cas/docs/adr/0016-openapi-description.md) and
[0017](../../apps/cas/docs/adr/0017-oidc-endpoints-under-a-prefix.md).
