---
title: API contract, OpenAPI and the client package
description: Every route is declared once with zod schemas through `@hono/zod-openapi`; that declaration validates the request, types the handler's response at compile time and produces the OpenAPI document. Two documents (`openapi.json`, `openapi.internal.json`) are committed and checked in CI; consumers use the kubb-generated `@memebattle/ligretto-core-client`, never hand-written types.
read_when:
  - adding or changing a route, a request or a response shape
  - changing an error code a client may branch on
  - consuming this API from another package or app
  - touching the OpenAPI generation or the client package's build
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

- **One declaration per route.** `createRoute({ method, path, request, responses })` with schemas from
  `src/contract`; `app.openapi(route, handler)`. The schemas validate the request at run time (`c.req.valid`),
  constrain the handler's `c.json(body, status)` at compile time, and are the OpenAPI document. There is no
  separate specification file to keep in sync.
- **Responses are not re-parsed at run time.** The compile-time check plus the HTTP tests hold the shape. (A
  response the compiler cannot see — the auth handlers return a ready `Response` — is covered by the schemas
  `@memebattle/ligretto-auth` exports and validates itself with.)
- **zod v4** for all schemas; `.meta()` carries descriptions and examples, inside the schema, never beside it.
  `valibot` was considered and rejected because `@hono/zod-openapi` is the implementation with compile-time
  response checking, which is the only guard left once responses are not parsed.
- **Two documents.** `createPublicApp` yields `openapi.json`, `createInternalApp` yields `openapi.internal.json`
  (`internal-api-and-service-authentication.md`). A script writes both; a CI job regenerates and fails on a diff.
  The public document is served at `/openapi.json`; the internal one is not served.
- **Auth routes.** The four `/api/auth/*` handlers come from `@memebattle/ligretto-auth` as
  `(Request) => Promise<Response>` and are mounted as they are. Their schemas come from the package's `./schema`
  entry; the package derives its `./contract` types from the same schemas and validates with them, so there is one
  source and it is the package that answers.
- **Clients.** `packages/ligretto-core-client` runs kubb over both documents and exposes two entries: the root for
  the public API (ligretto-frontend) and `./internal` for the internal API (ligretto-gameplay-backend). Operations
  return a result rather than throwing on an error status (`throwOnErrorDefault: false`, the style of
  `ligretto-auth`'s client). The package's PR job regenerates from the committed documents and type-checks, so a
  stale client never merges. Hono's own `hc` client is not the contract: consumers depend on the document, not on
  the server's source.
- **Errors.** Every non-2xx answer is `{ error: <stable code>, description?: string }` plus code-specific fields,
  declared per route with its status; see `error-responses.md`.
- `packages/ligretto-shared/apiTypes.ts` is deleted once both consumers are on the generated client; nothing
  hand-written describes this API afterwards.

## Consequences

- Adding a field to a response is: schema, handler, regenerate documents and client, consumer type-checks pass.
  Removing one: the same, and the consumer's type-check fails until it stops reading the field, which is the point.
- The handler cannot return an undeclared status or shape; a new error code is a schema change and shows up in the
  document and the client.
- `DESIGN.md` lists the routes and their shapes in prose for orientation; the schemas are the truth when they
  disagree, and the disagreement is a bug in `DESIGN.md`.
