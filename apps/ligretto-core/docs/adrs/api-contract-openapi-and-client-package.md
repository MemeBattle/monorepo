---
title: API contract, OpenAPI and the client package
description: >-
  Every route of this service is declared once with zod schemas through @hono/zod-openapi; that declaration
  validates the request, types the handler's response at compile time and produces the OpenAPI document. The four
  auth routes of ligretto-auth are mounted as plain handlers and documented, for both session transports, from the
  schemas that package exports; GET /api/users takes a CAS access token with aud ligretto. Two documents
  (openapi.json, openapi.internal.json) are committed and checked in CI; consumers use the kubb-generated
  @memebattle/ligretto-core-client, never hand-written types.
read_when:
  - adding or changing a route, a request or a response shape
  - changing an error code a client may branch on
  - consuming this API from another package or app
  - touching the OpenAPI generation or the client package's build or transport
---

# API contract, OpenAPI and the client package

## Context

The previous API had no description: the gameplay backend called it through a hand-written `post<T>` with types
copied into `packages/ligretto-shared/apiTypes.ts`, and the two drifted (`SaveRoundResponse` described one field
of a four-field answer). The requirement is a contract that is derived from the code that serves it, checked in
CI, and consumed through generated clients so that a breaking change fails a type-check in the consumer. The repo
already does this for CAS: a committed `openapi.json`, kubb generating clients in `ligretto-auth` and
`cas-frontend`, PR jobs that regenerate and type-check.

## Decision

- **One declaration per route of this service.** `createRoute({ method, path, request, responses })` with schemas
  from `src/contract`; `app.openapi(route, handler)`. The schemas validate the request at run time
  (`c.req.valid`), constrain the handler's `c.json(body, status)` at compile time — for a route with declared
  JSON content the handler cannot return a plain `Response`, an undeclared status or another shape — and are the
  OpenAPI document. There is no separate specification file to keep in sync.
- **Responses are not re-parsed at run time** by this service. The compile-time check plus the HTTP tests hold the
  shape.
- **zod v4** for all schemas; `.meta()` carries descriptions and examples, inside the schema, never beside it.
  `valibot` was considered and rejected because `@hono/zod-openapi` is the implementation with compile-time
  response checking, which is the only guard left once responses are not parsed.
- **Auth routes.** The four `/api/auth/*` handlers come from `@memebattle/ligretto-auth` as
  `(Request) => Promise<Response>`. They are registered as plain Hono routes (`app.get(path, c =>
handlers.me(c.req.raw))`), which pass the `Response` through unchanged, cookies and `Location` included, and
  are added to the document with `app.openAPIRegistry.registerPath(...)` using the request and response schemas
  the package exports from its `./schema` entry. The package derives its `./contract` types from those schemas,
  validates the _incoming_ data (the callback's query) with them, and builds its answers as values of the derived
  types; neither it nor this service parses an outgoing body — the same rule as for every route here: schemas and
  types in both directions, run-time validation of input only. The mount answers one failure itself: the session
  store's `SessionBusyError` is `503 session_busy`, declared on every auth route as a union with the package's `503`
  codes; everything else the handlers throw reaches the error handler unchanged. The handlers' answers are
  otherwise passed through as they are.
- **Access token on public data routes.** `GET /api/users` is guarded by `verifyAccessToken` of `ligretto-auth` with
  the fixed audience `ligretto` (the CAS registration, not configuration), guest and full accounts alike. A refused
  token is `401 unauthorized`; CAS metadata that cannot be read is `503 cas_unavailable`, since the token was never
  judged. The guard runs before the query is validated. The document declares it as the `accessToken` bearer
  scheme.
- **Input is validated once, where it enters.** For this service's routes that is the route declaration; for the
  auth routes it is the handler of `ligretto-auth`, and this service runs no validator in front of it — the plain
  `app.get` registration is also what keeps a second validation out. Downstream of that point use cases, adapters
  and repositories trust the types they receive and do not re-check the same data.
- **Two documents.** `createPublicApp` yields `openapi.json`, `createInternalApp` yields `openapi.internal.json`
  (`internal-api-and-service-authentication.md`). A script writes both; a CI job regenerates and fails on a diff.
  The public document is served at `/openapi.json`, equal to the committed file; the internal one is not served.
  Neither depends on the deployment's configuration: the auth routes are described from
  `authRouteFragments('cookie')` and `authRouteFragments('bearer')` merged, so `sign-in` and `logout` list the cookie
  transport's `302` and the bearer transport's `200 NavigationResponse` alike, and a client generated once fits
  either deployment. `AuthUser` is a named component, the item type of `GET /api/users`. Query arrays are
  described as `style: form, explode: true` (`?ids=a&ids=b`), and the schema accepts a single value by normalising
  it to an array before validation, since Hono hands one value over as a string.
- **Clients.** `packages/ligretto-core-client` runs kubb over both documents and exposes two entries: the root for
  the public API (ligretto-frontend) and `./internal` for the internal API (ligretto-gameplay-backend). Operations
  return a result rather than throwing on an error status (`throwOnErrorDefault: false`). The transport is this
  package's own, not a copy of `ligretto-auth`'s client, and it specifies: a base URL prefix; query serialisation
  matching the document (repeated keys for arrays); the complete error body preserved on a non-2xx answer, typed
  by status, so code-specific fields such as `playerIds` reach the caller; a transport failure (no response at
  all) as its own result kind; redirects never followed, because the only redirecting routes are browser
  navigations that are not fetched. Hono's own `hc` client is not the contract: consumers depend on the document,
  not on the server's source.
- **Errors.** Every non-2xx answer is `{ error: <stable code>, description?: string }` plus code-specific fields,
  declared per route with its status; see `error-responses.md`.
- `packages/ligretto-shared/apiTypes.ts` is deleted once both consumers are on the generated client; nothing
  hand-written describes this API afterwards.

## Consequences

- Adding a field to a response is: schema, handler, regenerate documents and client, consumer type-checks pass.
  Removing one: the same, and the consumer's type-check fails until it stops reading the field, which is the point.
- A typed handler cannot return an undeclared status or shape; a new error code is a schema change and shows up in
  the document and the client. The auth routes' guarantee lives in `ligretto-auth`; the client package's contract
  tests exercise them against `app.request()` like every other route.
- `DESIGN.md` lists the routes and their shapes in prose for orientation; the schemas are the truth when they
  disagree, and the disagreement is a bug in `DESIGN.md`.

upd (2026-10-24): the auth routes are mounted and documented for both transports, the mount answers
`SessionBusyError` as `503 session_busy`, and `GET /api/users` is guarded by a CAS access token
([#837](https://github.com/MemeBattle/monorepo/issues/837)).
