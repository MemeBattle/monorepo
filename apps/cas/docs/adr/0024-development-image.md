# 24. A development image, built locally

## Status

Accepted (2026-10-31), with [#875](https://github.com/MemeBattle/monorepo/issues/875).
Follows ADR 0009 (c) and ADR 0023: the debug-only development signing key and
`--secret` are what make the debug build the development variant. Follows
ADR 0022: the image mirrors what the Worker's assets do on a native server.
Amends ADR 0008 (e): `--if-missing` is an explicit exception to "not
idempotent". Nothing on the wire of a deployed CAS and nothing stored changes:
no migration, no new error code, no `openapi.json` change.

## Context

An application developer who runs the monorepo's own stack needs a local CAS,
and running one took five things by hand: the database, the `cas` binary from
a Rust toolchain, `cas-migrate`, the seed, and the frontend's dev server,
because the native binary served the API alone and the sign-in pages live in
the SPA. The production CAS is a Worker, so no image of it existed. The way
around all that was to point the stack at the production CAS, which puts
development data in its database and needs the network.

What has to be answered: which build the image is, how one container serves
the API and the SPA, what the image holds, who migrates and seeds, where the
database lives, and what happens to the image after it is built.

## Decision

**(a) One Dockerfile, with a build argument; debug is the development
variant.** `.docker/Cas_Dockerfile` takes `CAS_BUILD_PROFILE`, `debug` by
default. The development signing key and `cas-client register --secret` exist
in debug builds alone (ADR 0009 (c), ADR 0023), so a debug image starts with
no configuration and can seed a client with a known secret, which is what a
development stack wants. A release image needs `CAS_SIGNING_KEY` in its
environment, refuses to start without it, and cannot be seeded: its
`cas-client` refuses `--secret`. A second Dockerfile would be the same stages
twice.

**(b) One container, one origin: the binary serves the SPA.** `CAS_SPA_DIR`
names the built SPA, and `http::app` mounts it as the router's fallback, so
the routes keep answering first. It mirrors the Worker: a path that is a file
answers the file, any other path answers `index.html`, and `/oidc` and
`/.well-known`, part of `runWorkerFirst` in `cloudflare.config.ts`, never
answer the SPA. Unset, the server is the API alone, as it was. A directory
without `index.html` fails startup instead of serving nothing. The fallback
goes on after the middleware, outside the OpenAPI description, as the Worker's
assets are.

A second process in the image, nginx or similar, was rejected: it needs a
supervisor and a proxy configuration that restates the routing a third time,
next to the router and `runWorkerFirst`.

**(c) The image is the three binaries and the SPA, on distroless.** The
runtime is `gcr.io/distroless/cc-debian13:nonroot`, with no shell and no
entrypoint script: its command is `cas`, and `cas-migrate` or `cas-client`
replace it when named. The binaries are built against glibc on Debian 13 and
use rustls, and CAS makes no outbound TLS, so the C runtime is all they need.
`scratch` was not taken because a static musl build needs a musl C toolchain
and a target triple per host architecture in the build stage, for an image
that is not shipped.

**(d) Migrations and the seed are compose one-shots, not the image's job.**
`apps/cas/docker-compose.yml` runs the image three times under the profile
`image`: `cas-migrate`, then `cas-seed`, then the server, each started once
the previous one completed. Production keeps migrations a separate step
(`docs/MIGRATIONS.md`), and so does the image. `cas-seed` is the
`cas-client register` call of `scripts/seed-dev.sh`, with its values from the
monorepo's `.env.development`, the one source, through compose interpolation:
the two URIs are the `LIGRETTO_CORE_AUTH_*` values the backend sends, so a
newly seeded row matches the backend. An empty value is refused by
`cas-client`, so a run without the env file fails instead of registering a
client nobody can reach.

`cas-client register --if-missing` is the idempotent primitive the seed
needs, because it runs on every `up`. It is an explicit exception to
ADR 0008 (e): without the flag a second registration still fails. The flag
does not compare: a client with other values is left as it is, and the fix is
still a reset of the database. The library's `register` does not change.

Moving the seed into `cas-client` was rejected: it would compile the URIs of
one application into a binary that also ships in release builds.

**(e) CAS keeps its own `cas-pg` and its own compose project.** The image
services sit next to `cas-pg` in `apps/cas/docker-compose.yml`, behind the
profile, so a plain `docker compose up` there still starts the database
alone, as a CAS developer running the binary from cargo needs. The root
`docker-compose.yml` has nothing of CAS: `pnpm ligretto:start` brings up the
two projects one after the other, rather than including one in the other, so
each stays usable on its own.

**(f) The image is built locally and never published.** `docker compose`
builds it from the repository root on first use, which is what a developer
changing CAS wants, and BuildKit cache mounts keep a rebuild short. A registry
would add an image to keep in step with the code and a question of who runs
what; `pull_policy: never` keeps compose from looking for the tag in one.
Production CAS stays the Worker of `cas-deploy.yml`, which is untouched. CI
builds both variants without pushing, so the Dockerfile cannot rot unnoticed
and the build argument is proven.

## Consequences

- `pnpm ligretto:start` needs Docker and Node and no Rust toolchain, and
  development stays offline and out of the production CAS's database. The
  production CAS remains an override through `.env.development.local`.
- The image stack and a CAS developer's own runs share `cas-pg` and its
  volume: a client registered by hand stays, and a migration applied from
  another branch makes this branch's `cas-migrate` fail until the database is
  reset.
- The container has no healthcheck, since the image has nothing to run one
  with. `up --wait` returns once the one-shots completed and the server runs,
  which is enough: Ligretto's backends call CAS only when a user signs in.
- A running `bacon run` holds port 3000, so the container cannot publish it.
- `paths` of `cas-pr.yml` grows the image's inputs, so a pull request that only
  touches the frontend or the root lockfile runs every CAS job.
