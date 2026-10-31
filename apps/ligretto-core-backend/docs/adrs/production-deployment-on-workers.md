---
title: Production deployment on Workers
description: >-
  Ligretto is separate Workers sharing ligretto.app through Workers Routes: the assets-only ligretto-frontend on
  ligretto.app/*, this service on ligretto.app/api*, /health* and /openapi.json* and on the Custom Domain
  core-internal.ligretto.app; ligretto.app/gameplay/* is reserved for the gameplay Worker. Its production values are in
  the `production` mode of cloudflare.config.ts. One release workflow builds both Workers with no secrets, then behind
  one approval checks, migrates over the direct connection, uploads the core, then the frontend, then the source maps.
  DNS is never touched by a release. The first release is the activation; inert unrouted Workers exist until then and no
  secret is ever a placeholder.
read_when:
  - changing the release workflow, the order of its steps or what it checks
  - adding a Worker secret, a binding or a production value
  - changing a hostname, a route, the session transport or where the SPA is served
  - adding a Worker that shares ligretto.app
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

A Custom Domain binds a hostname to exactly one Worker, and Cloudflare refuses one over a hostname that has an externally
managed DNS record (error `100117`). Workers Routes bind a Worker to a path pattern on the zone; several Workers share one
hostname, and the most specific pattern wins. An environment's approval is asked for before a job enters its concurrency
group, so two runs of one release can wait for the approval at once.

## Decision

- **Production values live in the `production` mode of `cloudflare.config.ts`.** `build:worker` is the only build and always
  passes `--mode production`, so a pull request builds what a release uploads. `domains` and the routes are empty in any
  other mode. Overriding values through `.dev.vars` lost because it cannot remove `domains`, and a second config file lost
  because two files drift. The frontend Worker follows the same rule in its own `cloudflare.config.ts`.
- **Separate Workers on `ligretto.app`, through routes.** The SPA and the public app share one origin, `ligretto.app`, which
  keeps the cookie transport first-party and leaves production with no CORS origin. Each is its own Worker:
  `ligretto-frontend` owns `ligretto.app/*`, this Worker owns `ligretto.app/api*`, `ligretto.app/health*` and
  `ligretto.app/openapi.json*`, and `ligretto.app/gameplay/*` is reserved for the gameplay Worker. A route pattern
  matches the query string too, so each of these ends in `*`: an exact `ligretto.app/health` would hand
  `/health?probe=1` to the SPA. A path such as `/healthz` reaching this Worker's 404 is the accepted cost. The routes
  deliver `Host: ligretto.app`, so the hostname dispatch of `src/entry/worker.ts` sends them to the public app. The
  internal app keeps the Custom Domain `core-internal.ligretto.app`. One Worker serving the SPA as its assets lost because every static request would run
  it, and the dispatch would have to decide what is an asset. A subdomain of its own for the public app lost because it
  would only add an origin to configure. `workers.dev` is off on both, since the dispatch would refuse it anyway.
- **The frontend is an assets-only Worker.** No entrypoint, no bindings, no secrets,
  `notFoundHandling: 'single-page-application'`. Every request it receives is answered by the assets layer, never by Worker code. `cf build`
  delegates to `vite build` in a package that depends on vite, so its `build:worker` runs `cf-wrangler build`, the delegate
  `cf build` runs for a Wrangler project. The SPA's non-secret values are in the root `.env.production`, the file vite reads.
  Production says "same origin" by leaving `LIGRETTO_CORE_URL` unset. This Worker has no assets at all, so the internal host
  cannot serve the SPA by construction. That is Cloudflare configuration, so the activation checks of `README.md`
  verify it.
- **DNS is never touched by a release.** The routes need a proxied record on `ligretto.app`; it is a placeholder created by
  hand, as the Custom Domain's record is removed and created by hand. Letting the deploy replace the record lost because
  Cloudflare refuses it (`100117`).
- **One release for the product.** `.github/workflows/ligretto-release.yml` builds both Workers in parallel with no secrets,
  then one job behind one approval runs, each step stopping the next: the check of the built core
  Worker, the check that the frontend Worker exists, the migrations, the core's upload, the frontend's upload, the source
  maps. A failed build reaches neither the approval nor the schema. A failed check leaves the schema alone. A failed
  migration stops the uploads. The check reads the built artefact, not the source, so it cannot check something other than
  what ships. The frontend goes last, so a new SPA never meets an old API. The frontend Worker is checked before the
  migrations, so a missing one cannot fail the release after the core has attached its routes. `LIGRETTO_APP_VERSION` is
  the run id, one version for both Workers.
- **One release at a time, through `concurrency` alone.** The release job's `concurrency` group runs one release at a
  time and never cancels a running one, which may be halfway through its migrations. Runs waiting for the approval stay
  until approved, rejected or failed by GitHub after 30 days, so the owner approves the newest run.
- **The source map upload runs in the release job, after the uploads, from the frontend artefact.** It needs
  `SENTRY_AUTH_TOKEN`, so it cannot run in the build, and "build with no secrets" holds. It may fail without failing the
  release. The maps carry no debug ID, so it matches by release and URL prefix. Injecting debug IDs afterwards lost because
  it would change the artefact that was checked. Dropping the upload lost because symbolication would then rest on a Sentry
  scraper setting nothing here can verify.
- **Migrations run from the release job over the direct connection**, never through Hyperdrive or from the Worker. The issue
  also asks for `DATABASE_URL` on the Worker, so it is a declared secret that the runtime reads nowhere. Dropping it means
  removing the binding and running `cf workers secrets delete`.
- **The first release is the activation.** Inert Workers created by hand, with no bindings, routes or cron, exist until then:
  the core's holds its secrets, and the frontend's exists because the deploy token cannot create a Worker. Later releases
  inherit the secrets, so a release carries no Worker secret. No value is ever a placeholder, so a secret present on the
  Worker stands for a finished prerequisite, and the check refuses a release while one is missing. Uploading the
  application first lost because it would serve an unmigrated schema from the real hostnames.
- **The sweep runs hourly from a cron trigger**, in a request scope on the same two bindings. Both runtimes share
  `src/entry/run-sweep.ts`. A failed run logs `sweep_failed` and rethrows, so Cloudflare records the invocation as an exception.
- **The two Hyperdrive limits are budgeted together.** Their sum, plus any other client of the same compute, stays within half
  of `max_connections - superuser_reserved_connections`, leaving headroom for migrations and hand-run sessions. The numbers are
  in `README.md`.

## Consequences

- A new production value goes in `cloudflare.config.ts`.
- A new public path outside the three routes reaches the frontend Worker and answers the SPA, so it needs a route of its own.
- A new Worker secret is declared in the config and set on the Worker before the release that needs it, or the check stops
  that release.
- Merging before the human prerequisites are done is safe: the release stops at a check and a rerun continues.
- Readiness is shown by the sign-in route, which writes to `auth_requests`, not by `/health`.
- A growing sweep backlog shows as `sweep_sessions_left` or a timed-out invocation and would need a batch limit.
- `core-internal.ligretto.app` is reachable from the Internet. `internal-api-and-service-authentication.md` is what protects it.
- A static request is not an invocation of either Worker. A request to `ligretto.app` that matches no core route never
  reaches this Worker: a non-read there gets the assets layer's answer, not the public app's `404`.
- A change to the frontend or a workspace package it depends on starts the release, but not this package's pull request
  workflow.
- The gameplay Worker, when it exists, adds a build job beside `build-core`, a deploy step between the two uploads and the
  route `ligretto.app/gameplay/*`.

upd (2026-10-30): the SPA and the public app share ligretto.app, served by this Worker
([#865](https://github.com/MemeBattle/monorepo/issues/865)).

upd (2026-10-31): the SPA is its own Worker; both share ligretto.app through Workers Routes, released by one workflow
([#870](https://github.com/MemeBattle/monorepo/issues/870)).
