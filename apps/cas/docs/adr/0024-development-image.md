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
the API and the SPA, how a client gets registered on every start without
weakening ADR 0008, where the database lives, and what happens to the image
after it is built.

## Decision

**(a) One Dockerfile, with a build argument; debug is the development
variant.** `.docker/Cas_Dockerfile` takes `CAS_BUILD_PROFILE`, `debug` by
default. The development signing key and `cas-client register --secret` exist
in debug builds alone (ADR 0009 (c), ADR 0023), so a debug image starts with
no configuration and seeds a client with a known secret, which is what a
development stack wants. A release image needs `CAS_SIGNING_KEY` in its
environment, refuses to start without it, and has no seed: the script is
removed from the image, and the flag it would pass is refused at compile time
anyway. A second Dockerfile would be the same stages twice.

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

**(c) The entrypoint migrates before it serves, for this image only.**
Migrations stay a separate step in production (`docs/MIGRATIONS.md`), because
instances must keep serving during a rollout. Here there is one local
instance, so nothing is serving on the previous schema, and a developer who
pulls a new migration gets it by rebuilding.

**(d) The seed is `scripts/seed-dev.sh`, run by the debug image.** The script
is the one list of arguments, and `.env.development` the one source of the
values: the two URIs now come from the same `LIGRETTO_CORE_AUTH_*` values the
backend sends, so a newly seeded row matches the backend.
`cas-client register --if-missing` is the idempotent primitive the entrypoint
needs, because it runs on every start. It is an explicit exception to
ADR 0008 (e): without the flag a second registration still fails. The flag
does not compare: a client with other values is left as it is, and the fix is
still a reset of the database. The library's `register` does not change.

Moving the seed into `cas-client` was rejected: it would compile the URIs of
one application into a binary that also ships in release builds.

**(e) CAS's database is a second database and role in `ligretto-core-pg`, on
Postgres 18.** The stack then has one Postgres to start and wait for. 18 is
the engine CAS is tested on, and the container had to be pinned anyway: the
floating `postgres` tag no longer starts on a fresh machine with a volume on
`/var/lib/postgresql/data`. An init script creates the database, and it runs
on an empty volume alone; `docs/ligretto.md` says what an existing volume
needs.

**(f) The image is built locally and never published.** `docker compose`
builds it from the working tree on first use, which is what a developer
changing CAS wants, and BuildKit cache mounts keep a rebuild short. A registry
would add an image to keep in step with the code and a question of who runs
what. Production CAS stays the Worker of `cas-deploy.yml`, which is untouched.
CI builds both variants without pushing, so the Dockerfile cannot rot
unnoticed and the build argument is proven.

## Consequences

- `pnpm ligretto:start` needs Docker and Node and no Rust toolchain, and
  development stays offline and out of the production CAS's database. The
  production CAS remains an override through `.env.development.local`.
- The pin moves `ligretto-core-pg` to another major and another volume layout,
  so an existing `pg-ligretto` volume is refused and `docker compose down -v`
  drops the local data once. Local data is disposable, and matching the engine
  CAS is tested on matters more.
- ligretto-core-backend now develops on Postgres 18, while its e2e job and
  `ligretto-core-pg-test` stay on 13.4.
- A running `bacon run` holds port 3000, so the container cannot publish it.
  The CAS README's own flow is untouched: the image is the monorepo stack's way
  to run CAS, not CAS's.
- `paths` of `cas-pr.yml` grows the image's inputs, so a pull request that only
  touches the frontend or the root lockfile runs every CAS job.
