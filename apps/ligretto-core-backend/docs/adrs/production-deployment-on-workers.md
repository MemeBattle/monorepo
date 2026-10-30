---
title: Production deployment on Workers
description: >-
  The service runs as one Worker on ligretto.app, which it shares with the SPA as its static assets, and on
  core-internal.ligretto.app, which never serves an asset. Its production values are in the `production` mode of
  cloudflare.config.ts. A release is build with no secrets, approval, check of the built Worker, migrations over the
  direct connection, then upload, which attaches the domains and the cron, then the source map upload. The first release
  is the activation; an inert unrouted Worker holds the secrets until then and no secret is ever a placeholder.
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
- **Hostnames.** The SPA and the public app share one origin, `ligretto.app`, and the internal app is on
  `core-internal.ligretto.app`. One origin keeps the cookie transport, now first-party, and leaves production with no CORS
  origin. A subdomain of its own for the public app lost because, with the static files on Cloudflare too, it would only
  add an origin to configure. This settles the open question of `apps/cas/docs/PLAN.md`. `workers.dev` is off, since the
  hostname dispatch would refuse it anyway.
- **The Worker decides what is an asset.** `runWorkerFirst: true` sends every request to the Worker, and only the public
  host's branch of the dispatch reaches the `ASSETS` binding, so the internal host can never serve an asset. A path list, as
  CAS has, lost because `run_worker_first` patterns have no host: `GET /` on the internal host would serve the SPA. The
  public app owns `/api`, `/api/*`, `/health`, `/openapi.json` and every method but `GET` and `HEAD`, because the binding
  answers a non-read `405` and a wrong method must stay the public app's `404`. Everything else on the public host is the
  SPA, with the fallback to `index.html` for deep links.
- **One build for the Worker and the SPA.** `build:worker` builds the SPA first, so the check, the smoke suite and the
  release all see the Build Output production gets. The SPA's non-secret values are in the root `.env.production`, the file
  vite reads, and the Worker's stay in `cloudflare.config.ts`. Production says "same origin" by leaving `LIGRETTO_CORE_URL`
  unset, which needs no new variable and no code branch.
- **The source map upload runs in the release job, after the upload, from the artefact.** It needs `SENTRY_AUTH_TOKEN`, so it
  cannot run in the build, and "build with no secrets" holds. It may fail without failing the release. The maps carry no debug
  ID, so it matches by release and URL prefix. Injecting debug IDs afterwards lost because it would change the artefact that
  was checked. Dropping the upload lost because symbolication would then rest on a Sentry scraper setting nothing here can
  verify.
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
- Every static request runs the Worker and counts as an invocation, which the rule for the internal host requires. An asset
  does no database work: an unused request scope opens no connection.
- A change to the frontend or a workspace package it depends on starts this release and this package's pull request
  workflow.

upd (2026-10-30): the SPA and the public app share ligretto.app, served by this Worker
([#865](https://github.com/MemeBattle/monorepo/issues/865)).
