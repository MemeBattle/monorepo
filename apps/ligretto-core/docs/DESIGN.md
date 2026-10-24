# ligretto-core: design

The HTTP service of Ligretto: who the user is (through CAS, via `@memebattle/ligretto-auth`), the profile snapshots
of players, and the record of games and rounds the gameplay backend reports. It replaces
`apps/ligretto-core-backend` (AdonisJS), which stays in the tree, untouched and serving CI's e2e, until the last
issue of the milestone deletes it and renames this package to `ligretto-core-backend`.

This document holds the requirements, the target shape and the contracts. Decisions that constrain more than one
module are ADRs in `adrs/`; read `ADR.md` for how they are written. When this document and a schema in
`src/contract` disagree, the schema is right and this document has a bug.

## Requirements

1. **Framework-free business rules.** Use cases depend on ports, never on Hono, on a database client or on a
   runtime API. Hono is the HTTP layer and nothing more. → `adrs/layering-and-runtime-neutrality.md`
2. **Two runtimes from one source, out of the box.** Node.js and Cloudflare Workers both run from `src/entry/`,
   both are built and smoke-tested on every change. Workers is where the service is deployed (§ Deployment);
   Node stays a first-class runtime for development, CI and a possible return to Kubernetes, which must cost a
   manifest, not code. → `adrs/layering-and-runtime-neutrality.md`, `adrs/configuration-from-injected-environment.md`
3. **A contract derived from the code.** OpenAPI is produced from the route declarations that validate and type
   the handlers, committed, checked in CI, and consumed only through generated clients.
   → `adrs/api-contract-openapi-and-client-package.md`
4. **Additive schema changes with a compatibility window.** Any two adjacent releases work on each other's schema;
   CI proves it with generated row types. → `adrs/additive-migrations-and-compatibility-matrix.md`,
   `adrs/database-access-with-kysely.md`
5. **An internal API for other services**, unreachable publicly, authenticated independently of users.
   → `adrs/internal-api-and-service-authentication.md`
6. **Stable error codes; 500 only for the unhandled.** → `adrs/error-responses.md`
7. **Tests without Docker for everything that does not need two connections.** → `adrs/testing-strategy.md`

Non-goals for the milestone: CAS client credentials for the internal API (a CAS ticket, after the milestone;
the shared secret serves until then), changes to the gameplay protocol, an admin surface.

## Shape

```
apps/ligretto-core/
  src/core/        use cases, domain types, ports, config schema          (web standard + zod only)
  src/contract/    zod schemas of requests, responses, errors
  src/http/        createPublicApp(deps), createInternalApp(deps), middleware, OpenAPI
  src/adapters/    pg/ (Kysely repositories, session store, schema.generated.ts), logger, clock
  src/entry/       node.ts, worker.ts, migrate.ts, sweep.ts
  migrations/      <timestamp>_<name>.ts, SQL inside
  openapi.json, openapi.internal.json      committed, regenerated and diffed in CI
  docs/            this file, ADR.md, adrs/
```

Composition happens in the entries: an entry builds `Config`, the database handles, the adapters and the
`AuthHandlers` of `ligretto-auth`, calls the two app factories and exposes them the way its runtime allows (one
server on Node; `fetch` plus a service binding on Workers).

## Data

The schema is this package's own: the first migration creates it from scratch, and nothing of the Adonis schema is
kept or migrated — there is no production data. Conventions: snake_case names everywhere, `created_at`/`updated_at`
as `timestamptz`, the session timestamps as `bigint` epoch milliseconds (the unit the `SessionStore` port uses).

| Table                                        | Purpose                                                                                                              | Key                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users`                                      | profile snapshot written on every grant by the session store: `cas_id`, `account_type`, `display_name`, `avatar_url` | `cas_id`                                                                        |
| `games`                                      | a game created by the gameplay backend                                                                               | `id` uuid                                                                       |
| `rounds`                                     | a round of a game                                                                                                    | `id` uuid, `game_id`                                                            |
| `round_users`                                | a player's score in a round: `round_id`, `user_id` (= `users.cas_id`), `score`                                       | (`round_id`, `user_id`) — the primary key; the old serial `id` has no successor |
| `sessions`, `auth_requests`, `session_locks` | the `SessionStore` of `ligretto-auth`; see `adrs/session-store-locking.md`                                           |                                                                                 |

## Routes

Status codes and bodies are declared per route in `src/contract`; this is the readable summary. Every error body is
`{ error, description? }` plus the fields named here (`adrs/error-responses.md`). Validation failures are
`400 validation_failed` with `issues`.

### Public: `/api`, served on the public hostname

| Route                    | Auth                                                                       | Request                              | Responses                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`            | none                                                                       |                                      | `200` / `503` with the check report (database reachable within a timeout)                                                        |
| `GET /api/auth/me`       | session (cookie or bearer, per transport)                                  |                                      | `MeResponse` and the auth error codes, as `ligretto-auth` defines them                                                           |
| `GET /api/auth/sign-in`  | session                                                                    |                                      | `302` (cookie transport) or `200 NavigationResponse` (bearer)                                                                    |
| `GET /api/auth/callback` | session                                                                    | `?state&code`                        | `302` / `200 NavigationResponse`; `400 unknown_state`, `400 sign_in_failed`, `429`, `503`                                        |
| `GET /api/auth/logout`   | session                                                                    |                                      | `302` / `200 NavigationResponse`                                                                                                 |
| `GET /api/users`         | `Authorization: Bearer <access token>` (`aud: ligretto`, guest or account) | `?ids=<sub>&ids=<sub>`, 1–100 values | `200 AuthUser[]`: `{ sub, accountType, name, avatarUrl }` for each id that has a row; unknown ids are absent. `401 unauthorized` |

The auth routes are `ligretto-auth`'s handlers mounted as they are; their contract is the package's, described
from the schemas it exports. `GET /api/users` reuses `AuthUser` from that contract so a frontend holds one user
type. The answer is a lookup, not a claim that every id exists.

### Internal: `/internal`, reachable only by services

Authentication on every route: `Authorization: Bearer <LIGRETTO_INTERNAL_API_TOKEN>`; `401 invalid_internal_token`
otherwise.

| Route                              | Request                                                                          | Responses                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /internal/games`             | empty body                                                                       | `201 { id: uuid }`                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /internal/games/{id}/rounds` | `{ results: [{ playerId: sub, score: int }] }`, 1+ entries, distinct `playerId`s | `200 { gameResults: Record<sub, { roundScore, gameScore }> }` — every player of every round of the game, `gameScore` the sum so far, `roundScore` this round's or `0`. `404 game_not_found`. `422 unknown_players { playerIds }` when a `playerId` has no `users` row (a player exists in `users` from the moment of their first grant, so this is a bug in the caller, not a race). |

The previous `GET /api/games` (every game with every column, no caller) and the public game-creation routes have no
successor.

## Runtimes and entries

| Entry              | Runs                                                                                                                                                                         | Database                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `entry/node.ts`    | `@hono/node-server`, both apps on one port, `.env` through `dotenv-flow` in development                                                                                      | two `pg.Pool`s for the process (`adrs/session-store-locking.md`)                                       |
| `entry/worker.ts`  | `fetch` → public app; a `WorkerEntrypoint`/service binding → internal app                                                                                                    | `pg` clients per request on the Hyperdrive binding, closed in `waitUntil`                              |
| `entry/migrate.ts` | Kysely `Migrator`, `migrateToLatest()`, exits non-zero on failure                                                                                                            | `DATABASE_URL`                                                                                         |
| `entry/sweep.ts`   | expired `auth_requests` and sessions past the cookie grace, each session under its lock; on Workers the same use case runs from the `scheduled` handler of `entry/worker.ts` | `DATABASE_URL`; scheduled by whatever runs the service (a cron job on Node, a cron trigger on Workers) |

Locally: Postgres from the root `docker-compose.yml`, the entries from the host (`pnpm start:dev` runs
`entry/node.ts` under `tsx watch`; `pnpm dev:worker` runs `wrangler dev` with the Hyperdrive binding's
`dev.connectionString` pointing at the same database). Nothing of this service runs inside Docker in development.

## Deployment

Cloudflare Workers, the way CAS is deployed (`apps/cas/cloudflare.config.ts`, `cas-deploy.yml`): a release
workflow builds the Worker, applies the migrations with `entry/migrate.ts` against `DATABASE_URL`, then uploads
with `cf deploy --prebuilt`. The database is Neon behind Hyperdrive; secrets (`DATABASE_URL`,
`LIGRETTO_CAS_CLIENT_SECRET`, `LIGRETTO_INTERNAL_API_TOKEN`) are Worker secrets. The public hostname follows the
origin layout the cutover issue ([#818](https://github.com/MemeBattle/monorepo/issues/818)) records: one origin
with the SPA and `/api/*` under the cookie transport, or separate hosts under the bearer transport. The internal
app is exposed on a dedicated hostname that is not the public one, since the gameplay backend is not a Worker and
cannot use a service binding; the shared secret is what protects it on either path. The sweep runs from a Workers
cron trigger (`scheduled` in `entry/worker.ts`); `entry/sweep.ts` remains for any other runtime. The Node image
(`.docker/Ligretto-core-backend_Dockerfile`) keeps being built in CI as the packaging of the Node entry.

## CI (per pull request)

- lint, format, `tsc`, vitest (PGlite suites); the store suite against the job's Postgres;
- both entries smoke-tested (`/health`);
- `openapi.json`, `openapi.internal.json` and `schema.generated.ts` regenerated and diffed against the commit;
- the compatibility matrix and the migration checks (`adrs/additive-migrations-and-compatibility-matrix.md`);
- `packages/ligretto-core-client` regenerated from the committed documents and type-checked, with its contract
  tests against `app.request()`.

## Consumers

- `apps/ligretto-gameplay-backend` → `@memebattle/ligretto-core-client/internal` with the shared secret.
- `apps/ligretto-frontend` → `@memebattle/ligretto-core-client` for `/api/users` (with the bearer token it
  already receives from `/api/auth/me`) and the `/api/auth/*` navigations.
- `packages/ligretto-shared/apiTypes.ts` is deleted when both are on the generated client.

## Later, outside the milestone

- CAS `client_credentials` grant; the internal middleware switches from the shared secret to
  `verifyAccessToken` + `client_id` (`adrs/internal-api-and-service-authentication.md`).
