---
title: Internal API and service authentication
description: Routes meant for other services live in a second Hono app under `/internal`, described by their own OpenAPI document and reachable only with a shared secret in `Authorization: Bearer` (two accepted values, for rotation). User tokens are never used between services. CAS client credentials replace the secret when CAS gains the grant.
read_when:
  - adding a route another service calls
  - changing how ligretto-gameplay-backend calls this service
  - exposing the service on a new runtime (what is public, what is not)
  - rotating or replacing the internal secret
---

# Internal API and service authentication

## Context

The gameplay backend creates games and saves round results. These are facts the game engine computed, not actions
of any one player: forwarding a player's token would authorise the wrong principal, expire mid-round, or be a
guest's. The previous service exposed these routes publicly without authentication. CAS supports
`authorization_code`, `refresh_token` and its guest grant; it has no `client_credentials` grant yet
(`apps/cas/docs/PLAN.md` lists it as postponed until a service-to-service need appears — this is that need).

## Decision

- **Two applications from one factory.** `createPublicApp(deps)` serves `/api/*` and `/health`;
  `createInternalApp(deps)` serves `/internal/*`. The entry decides exposure: on Node both are mounted on one
  server and the network (ingress, service mesh) keeps `/internal` off the public hostname; on Workers the public
  app is the `fetch` handler on the public hostname and the internal app answers on a dedicated hostname (or a
  service binding when the caller is itself a Worker — the gameplay backend is not). Network exposure is a
  runtime property; the application-level authentication below applies on every path.
- **Shared secret, for now.** `LIGRETTO_INTERNAL_API_TOKEN` is a comma-separated list of one or two values on both
  sides; a request must carry one of them in `Authorization: Bearer`. Comparison is constant-time. A missing or
  unknown token answers `401 { error: "invalid_internal_token" }`. Two values exist so a rotation is: add the new
  one to the server, switch the client, remove the old one — no window without a valid token.
- **Later: CAS client credentials.** When CAS implements `grant_type=client_credentials` (confidential client,
  `aud` from the client's audience, a claim marking a service token, RFC 9068 as the profile), the middleware
  switches to `verifyAccessToken` from `@memebattle/ligretto-auth` plus a check of `client_id`. Nothing else in
  this service changes. That work is a CAS ticket with its own ADR there, outside this milestone.
- **Separate document, separate client entry.** The internal app has its own `openapi.internal.json` and its own
  entry in `@memebattle/ligretto-core-client` (`./internal`); its error vocabulary does not include the auth
  errors of the public API.
- **Compatibility.** The internal contract changes additively, like the schema: the two services do not deploy
  atomically. No version segment in the path; there is one consumer, in this repository, and its generated client
  fails CI on an incompatible change.

## Consequences

- No public route creates or mutates games. The public API is `users` and `auth`.
- The gameplay backend needs the secret in its environment and the `./internal` client; its hand-rolled `post<T>`
  goes away.
- A third service wanting in gets the same secret today, which is the known weakness that the CAS grant removes.
