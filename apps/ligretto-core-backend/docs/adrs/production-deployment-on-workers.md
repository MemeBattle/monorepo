---
title: Production deployment on Workers
description: >-
  The service runs as one Worker on core.ligretto.app and core-internal.ligretto.app, its production values in the
  `production` mode of cloudflare.config.ts. A release is build with no secrets, approval, check of the built Worker,
  migrations over the direct connection, then upload, which attaches the domains and the cron. The first release is the
  activation; an inert unrouted Worker holds the secrets until then and no secret is ever a placeholder.
read_when:
  - changing the release workflow, the order of its steps or what it checks
  - adding a Worker secret, a binding or a production value
  - changing a hostname, the session transport or where the SPA is served
  - resizing a Hyperdrive configuration or adding a client of the same database
  - changing the sweep's schedule or how a failed run is reported
---

# Production deployment on Workers

## Context

`DESIGN.md` § Deployment settled Workers, Neon and two cache-disabled Hyperdrive configurations
(`database-access-with-kysely.md`, `session-store-locking.md`). It left open the public hostname and how production values
reach the Worker. `cf dev` rewrites `request.url` to the first entry of `domains`, so a configuration that declares the
real hostnames answers every local request `unknown_host`. `cf deploy` refuses a declared secret on a Worker that does not
exist, and a missing secret fails the upload. `src/adapters/pg/probe.ts` selects a constant, so `/health` proves nothing
about the schema. The sweep has to run, and `layering-and-runtime-neutrality.md` keeps the use case free of the runtime.

## Decision

- **Production values live in the `production` mode of `cloudflare.config.ts`.** `build:worker` is the only build and always
  passes `--mode production`, so a pull request builds what a release uploads. `domains` is empty in any other mode.
  Overriding values through `.dev.vars` lost because it cannot remove `domains`, and a second config file lost because two
  files drift.
- **Hostnames.** The SPA stays on `ligretto.app`, the public app is on `core.ligretto.app`, the internal app on
  `core-internal.ligretto.app`. The first two are one site, so the session uses the cookie transport. This settles the open
  question of `apps/cas/docs/PLAN.md`. `workers.dev` is off, since the hostname dispatch would refuse it anyway.
- **Release order.** Build with no secrets, approval, check, migrate, upload, each stopping the next. A failed build reaches
  neither the approval nor the schema. A failed check leaves the schema alone. A failed migration stops the upload. The check
  reads the built artefact, not the source, so it cannot check something other than what ships.
- **Migrations run from the release job over the direct connection**, never through Hyperdrive or from the Worker. The issue
  also asks for `DATABASE_URL` on the Worker, so it is a declared secret that the runtime reads nowhere. Dropping it means
  removing the binding and running `cf workers secrets delete`.
- **The first release is the activation.** An inert Worker created by hand, with no bindings, routes or cron, holds the
  secrets until then. Later releases inherit them, so a release carries no Worker secret. No value is ever a placeholder, so a
  secret present on the Worker stands for a finished prerequisite, and the check refuses a release while one is missing.
  Uploading the application first lost because it would serve an unmigrated schema from the real hostnames.
- **The sweep runs hourly from a cron trigger**, in a request scope on the same two bindings. Both runtimes share
  `src/entry/run-sweep.ts`. A failed run logs `sweep_failed` and rethrows, so Cloudflare records the invocation as an exception.
- **The two Hyperdrive limits are budgeted together.** Their sum, plus any other client of the same compute, stays within half
  of `max_connections - superuser_reserved_connections`, leaving headroom for migrations and hand-run sessions. The numbers are
  in `README.md`.

## Consequences

- A new production value goes in `cloudflare.config.ts`, and `scripts/cloudflare-config.spec.ts` holds the invariants.
- A new Worker secret is declared in the config and set on the Worker before the release that needs it, or the check stops
  that release.
- Merging before the human prerequisites are done is safe: the release stops at the check and a rerun continues.
- Readiness is shown by the sign-in route, which writes to `auth_requests`, not by `/health`.
- A growing sweep backlog shows as `sweep_sessions_left` or a timed-out invocation and would need a batch limit.
- `core-internal.ligretto.app` is reachable from the Internet. `internal-api-and-service-authentication.md` is what protects it.
