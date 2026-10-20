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

## Endpoints come from the issuer

No path is hard-coded. The discovery document is read at
`{issuer}/.well-known/openid-configuration`, appended to the **full** configured
issuer, so an issuer that carries a path keeps it; the document's own `issuer`
must equal the configured one byte for byte before it is trusted (ADR 0009 (e));
and every other endpoint, the JWKS included, is the one the document advertises
(ADR 0017). The document and the JWKS are cached for as long as their
`Cache-Control: max-age` says, and an answer without one is not cached at all.
Only metadata a verification can be run from is cached: a body that is no JSON
object at all, a document that advertises no `jwks_uri` or algorithms and a key
set that is not one are refused as `malformed_metadata`, and a key set holding
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

The output is committed, and `ligretto-auth-pr.yml` regenerates it and fails on
any difference, so the committed client always matches the description.

The transport the generated operations call is `src/client.ts`. It appends
every path of the description to the `baseUrl` of `createClient({ baseUrl })`,
so a base URL that carries a path keeps it; follows no redirect
(`redirect: 'manual'`; a 3xx is thrown); passes caller headers through, each
winning over the content type the body encoding would set, whatever its casing;
sends a string body verbatim as `application/x-www-form-urlencoded` (the token
endpoint's form body, which must not be quoted into JSON) and any other body as
JSON; and hands a declared 4xx back as a value whose `code` is typed from the
description and whose `headers` are the response's, so a caller reads the
`Retry-After` a `429` prescribes. Anything else — a redirect, a 5xx, a body
that is not JSON whatever the status — is thrown as an `ApiError` carrying the
same `code`, `status` and `headers`.

## Scripts

- `pnpm run --filter @memebattle/ligretto-auth ts-check`
- `pnpm run --filter @memebattle/ligretto-auth test` / `test:ci`
- `pnpm run --filter @memebattle/ligretto-auth generate:api`

## Decisions

Recorded here rather than in an ADR directory, which no package in this
repository keeps:

- Web standards and server-only, as above; no Node API in `src/`, no
  `@types/node`, no framework import.
- `src/generated/` is generator-owned, committed, and proven fresh in CI by
  regenerate-and-diff, with untracked output counted as a difference.
- The transport lives in this package rather than being copied per consumer,
  and generated files are never edited: a call that must reach a discovered URL
  goes through `atUrl`, which replaces the request's URL and nothing else.
- Verification failures are typed errors with stable, distinct codes, and a
  provider that cannot be reached or trusted is a different error class from a
  refused token.
- No build step yet: the package exports TypeScript source, as
  `@memebattle/ligretto-shared` does. The first runtime consumer decides the
  build shape.

Background: [INTEGRATION.md](../../apps/cas/docs/INTEGRATION.md) §2, §3 and §6,
and the CAS ADRs
[0009](../../apps/cas/docs/adr/0009-signing-key-and-discovery.md),
[0011](../../apps/cas/docs/adr/0011-token-endpoint-and-access-tokens.md),
[0016](../../apps/cas/docs/adr/0016-openapi-description.md) and
[0017](../../apps/cas/docs/adr/0017-oidc-endpoints-under-a-prefix.md).
