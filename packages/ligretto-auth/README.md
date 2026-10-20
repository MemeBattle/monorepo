# @memebattle/ligretto-auth

The server side of talking to [CAS](../../apps/cas), the identity provider:
the types and HTTP client generated from its OpenAPI description, and
`verifyAccessToken`, which a resource server uses to verify a bearer token
without asking CAS anything.

**Server-only.** The package verifies tokens and, from the confidential client
on, holds a client secret. Nothing here belongs in a browser bundle: an
application's frontend talks to its own backend, and that backend talks to CAS
([INTEGRATION.md §1](../../apps/cas/docs/INTEGRATION.md)).

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
  §11. Ending the application's own session is the caller's.

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
still arrives as the transport reported it: an `ApiError`, or the network's
own failure.

A `refresh` is the one call that refuses an ID token differently. CAS retires
the presented refresh token the moment it answers `200` (ADR 0012 (b)), so a
refusal that comes after that answer arrives as an `UnusableGrantError`
carrying the rotated `grant` — the tokens, no account snapshot — with the
`InvalidIdTokenError` or `DiscoveryError` as its `cause`. Record the grant
before answering the failure: dropping it leaves the caller holding a token
CAS has spent, and presenting that one again is read as theft and revokes the
whole grant. `refreshSession` below does exactly that.

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
  since the claims they came in were refused — and the error rethrown. Every
  other failure leaves the session as it was.
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
`Retry-After` a `429` or a `503` prescribes. Only what is outside the contract
is thrown: a network failure as `fetch` reports it, and as an `ApiError`
carrying the `status` and `headers` a redirect, an error response whose body
carries no code (a proxy's page, not CAS) and a 2xx whose body is not JSON.

The generated operations take a `throwOnError` option and a `ThrowOnError` type
parameter: kubb's plugin-client prints both into every operation and offers no
way to leave them out, only their default, which `kubb.config.ts` sets to
`false`. The transport does not read them, and `Options` types the option as
`never`, so a caller cannot ask for a throw that would never happen.

## Scripts

- `pnpm run --filter @memebattle/ligretto-auth ts-check`
- `pnpm run --filter @memebattle/ligretto-auth test` / `test:ci`
- `pnpm run --filter @memebattle/ligretto-auth generate:api`

## Decisions

Recorded here rather than in an ADR directory, which no package in this
repository keeps:

- Web standards and server-only, as above; no Node API in `src/`, no
  `@types/node`, no framework import.
- `src/generated/` is generator-owned and committed; CI type-checks and tests
  against freshly generated output rather than demanding the committed copy be
  current.
- An error CAS answered with is a value, never an exception; only the network
  and responses outside the contract throw.
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
  spent either way and presenting it again would cost the whole grant.
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
- No build step yet: the package exports TypeScript source, as
  `@memebattle/ligretto-shared` does. The first runtime consumer decides the
  build shape.

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
