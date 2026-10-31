---
title: Internal API and service authentication
description: >-
  Routes meant for other services live in a second Hono app under /internal, described by their own OpenAPI
  document, served on a hostname that is not the public one, and accepted only with a shared secret in
  "Authorization: Bearer" (two accepted values, for rotation). User tokens are never used between services. CAS
  client credentials replace the secret when CAS gains the grant.
read_when:
  - adding a route another service calls
  - changing how ligretto-gameplay-backend calls this service
  - exposing the service on a new runtime or hostname (what is public, what is not)
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
  `createInternalApp(deps)` serves `/internal/*`. The entry decides exposure. On Node both are mounted on one
  server and the network (ingress, service mesh) keeps the internal paths off the public hostname. On Workers the
  `fetch` handler dispatches on the `Host` header: the public hostname reaches the public app, the internal
  hostname reaches the internal app, and any other hostname is a 404. The internal app is unreachable on the public
  hostname: only `/api*`, `/health` and `/openapi.json` of `ligretto.app` are routed to this Worker, so `/internal`
  there reaches the frontend Worker and answers the SPA, and the dispatch would send anything else on that host to the
  public app's 404.
  A named `WorkerEntrypoint` additionally exposes the internal app to service bindings for callers that are
  Workers; the gameplay backend is not one, hence the hostname. The internal API is therefore reachable from the
  Internet on its own hostname and is an authenticated API, not a hidden one: network placement limits exposure,
  the authentication below is what protects it.
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
- The gameplay backend needs the secret and the internal hostname in its environment and the `./internal` client;
  its hand-rolled `post<T>` goes away.
- A third service wanting in gets the same secret today, which is the known weakness that the CAS grant removes.

upd (2026-10-30): the internal hostname is `core-internal.ligretto.app`; `README.md` holds the rotation commands
([#843](https://github.com/MemeBattle/monorepo/issues/843)).

upd (2026-10-30): the public hostname also serves the SPA, so a read of `/internal` there answers the SPA; the internal
app stays unreachable on it ([#865](https://github.com/MemeBattle/monorepo/issues/865)).

upd (2026-10-31): the SPA is its own Worker, and only `/api*`, `/health` and `/openapi.json` of the public hostname are
routed to this one; the internal app stays unreachable on it ([#870](https://github.com/MemeBattle/monorepo/issues/870)).
