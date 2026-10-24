# ligretto-core: design

The HTTP service of Ligretto: who the user is (through CAS, via `@memebattle/ligretto-auth`), the profile snapshots
of players, and the record of games and rounds the gameplay backend reports. It replaces
`apps/ligretto-core-backend` (AdonisJS), which stays in the tree untouched until the last issues of the milestone
switch CI to this package, delete it and rename this package to `ligretto-core-backend`.

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
5. **An internal API for other services**, on its own hostname, authenticated independently of users.
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
  src/entry/       node.ts, worker.ts, migrate.ts, codegen.ts, sweep.ts; env.ts (the development .env loader)
  migrations/      <timestamp>_<name>.ts, SQL inside (MIGRATIONS.md)
  test/            worker/ (the Worker smoke suite), store/ (the Docker Postgres suite), http/ (HTTP suites on the
                   real adapters over PGlite), support/ (harnesses)
  .env.development DATABASE_URL for development
  openapi.json, openapi.internal.json      committed, regenerated and diffed in CI
  docs/            this file, ADR.md, adrs/
```

Composition happens in the entries: an entry builds `Config`, the database handles, the adapters and the
`AuthHandlers` of `ligretto-auth`, calls the two app factories and exposes them the way its runtime allows (one
server on Node; a `fetch` that dispatches on `Host`, plus a service-binding entrypoint, on Workers).

## Data

The schema is this package's own: the first migration creates it from scratch, and nothing of the Adonis schema is
kept or migrated — there is no production data.

| Table                                        | Purpose                                                                                                              | Key                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `users`                                      | profile snapshot written on every grant by the session store: `cas_id`, `account_type`, `display_name`, `avatar_url` | `cas_id` text                                           |
| `games`                                      | a game created by the gameplay backend                                                                               | `id` uuid                                               |
| `rounds`                                     | a round of a game: `game_id`                                                                                         | `id` uuid, supplied by the caller                       |
| `round_users`                                | a player's score in a round: `round_id`, `user_id` (= `users.cas_id`), `score`                                       | (`round_id`, `user_id`)                                 |
| `sessions`, `auth_requests`, `session_locks` | the `SessionStore` of `ligretto-auth`; see `adrs/session-store-locking.md`                                           | `id` / `state` / `id`, text — ids `ligretto-auth` mints |

A `sessions` row is the port's `Session` column for column: the grant and **its own** profile snapshot
(`account_type`, `display_name`, `avatar_url`). `getSession` returns a session's own snapshot, and `ligretto-auth`
keeps a session's last validated one when a rotation's ID token cannot be used, so two sessions of one subject may
differ until each refreshes. `users` holds the latest snapshot per `cas_id`; the session store writes both in one
transaction.

Invariants the first migration establishes (and `adrs/additive-migrations-and-compatibility-matrix.md` protects):

- snake_case names; `created_at` / `updated_at` as `timestamptz` with `DEFAULT now()` on every table that has them:
  `users` has both, `games`, `rounds` and `round_users` have `created_at`, the auth tables have neither.
- `games.id` is `uuid DEFAULT gen_random_uuid()` (so `Generated<string>` in the row types). `rounds.id` is `uuid`
  without a default: the gameplay backend supplies it (§ Routes). `sessions.id`, `session_locks.id`,
  `auth_requests.state` and every `sub` / `cas_id` are `text`: `ligretto-auth` mints base64url ids and CAS owns
  the subject format; none of them has a generated default.
- `users.account_type` and `sessions.account_type` are `text` with a `CHECK` on the values of `ligretto-auth`'s
  `AccountType`; the adapter narrows it to the union. A new account type is one additive migration either way;
  `text` keeps it a plain `ALTER TABLE` rather than enum mechanics.
- Session timestamps (`access_token_expires_at`, `grant_ends_at`, `grant_started_at`, `auth_requests.expires_at`)
  are `bigint` epoch milliseconds, the unit of the `SessionStore` port; `pg` delivers them as strings and the
  adapter converts with `Number`.
- Nullable: `display_name` and `avatar_url` on `users` and on `sessions`, `auth_requests.session_id`,
  `auth_requests.sub`. Everything else is `NOT NULL`.
- Foreign keys only inside the game aggregate: `rounds.game_id → games.id`, `round_users.round_id → rounds.id`,
  `round_users.user_id → users.cas_id`. None from `sessions` or `auth_requests`, deliberately: a pending sign-in or a
  session survives whatever happens to the row it points at (the initiating session may be deleted mid sign-in).
- Indexes: `sessions(grant_ends_at)` and `auth_requests(expires_at)` for the sweep; `rounds(game_id)`.

## Routes

Status codes and bodies are declared per route in `src/contract`; this is the readable summary. Every error body is
`{ error, description? }` plus the fields named here (`adrs/error-responses.md`). Validation failures are
`400 validation_failed` with `issues`.

### Public: `/api`, served on the public hostname

| Route                    | Auth                                                                       | Request                                                                                                 | Responses                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`            | none                                                                       |                                                                                                         | `200` / `503` with the check report (database reachable within a timeout)                                                                                                                        |
| `GET /api/auth/me`       | session cookie or `Authorization: Bearer <session id>`, per transport      |                                                                                                         | `200 MeResponse` (a guest session is minted when none is presented); `429 rate_limit_exceeded`, `503 cas_unavailable`, `503 cas_rejected`                                                        |
| `GET /api/auth/sign-in`  | optional session (an upgrade carries the current one)                      |                                                                                                         | cookie transport: `302` to CAS; bearer: `200 NavigationResponse`. `429 rate_limit_exceeded`, `503 cas_unavailable`, `503 cas_rejected`                                                           |
| `GET /api/auth/callback` | the state cookie set by sign-in                                            | `?state&code`, or `?state&error&error_description` from CAS                                             | `302` to the application in **both** transports (bearer carries the session id in the URL fragment); `400 unknown_state`, `400 sign_in_failed`, `429`, `503 cas_unavailable`, `503 cas_rejected` |
| `GET /api/auth/logout`   | session                                                                    |                                                                                                         | cookie: `302` to CAS end-session or the app; bearer: `200 NavigationResponse`. `503 cas_unavailable`                                                                                             |
| `GET /api/users`         | `Authorization: Bearer <access token>` (`aud: ligretto`, guest or account) | `?ids=<sub>&ids=<sub>`, 1–100 values; a single `ids=` is accepted and normalised to a one-element array | `200 AuthUser[]`: `{ sub, accountType, name, avatarUrl }` for each id that has a row; unknown ids are absent. `401 unauthorized`                                                                 |

The auth routes are `ligretto-auth`'s handlers mounted as they are; their contract is the package's, described
from the schemas it exports, and the rows above summarise `packages/ligretto-auth/src/handlers.ts`. `GET /api/users`
reuses `AuthUser` from that contract so a frontend holds one user type. The answer is a lookup, not a claim that
every id exists.

CORS on the public app: the allowed origins come from configuration (`LIGRETTO_CORE_CORS_ORIGINS`, a list), with
credentials allowed for them and for nothing else; the cookie transport needs it in development, where the SPA and
the API are on different origins. The internal app sends no CORS headers.

### Internal: `/internal`, served on the internal hostname

Authentication on every route: `Authorization: Bearer <LIGRETTO_INTERNAL_API_TOKEN>`; `401 invalid_internal_token`
otherwise.

| Route                              | Request                                                                                                                                                                                       | Responses                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /internal/games`             | empty body                                                                                                                                                                                    | `201 { id: uuid }`                                                                                                                                                                                                                                                                                                       |
| `POST /internal/games/{id}/rounds` | `{ roundId: uuid, results: [{ playerId: sub, score: int32 }] }`, 1+ entries, distinct `playerId`s, `score` within the `integer` column's range; `roundId` minted by the caller once per round | `200 { gameResults: Record<sub, { roundScore, gameScore }> }` — every player of every round of the game, `gameScore` the sum so far, `roundScore` this round's or `0`. `404 game_not_found`. `422 unknown_players { playerIds }`. `409 round_conflict` when `roundId` already exists with another game or other results. |

Saving a round is one transaction: lock the game row (`SELECT … FOR UPDATE`, so saves of one game are serialised
and totals are consistent), check the players exist in `users`, insert the round and its `round_users` unless a
round with that `roundId` and identical results already exists, then aggregate. A rejection leaves nothing behind.
A repeated submission (a retry after a lost response) answers `200` with the game's **current** totals, which may
include rounds committed since the first attempt; the caller keeps both the `roundId` and the frozen results across
attempts and never mints a new id for the same round. A player exists in `users` from their first grant, so
`unknown_players` is a bug in the caller, not a race.

Every statement of that transaction, the `users` check included, goes through the locked game (`LockedGame` of
`GamesRepository.withGame`) on the transaction's connection, never through another repository or handle. The round
insert is `ON CONFLICT (id) DO NOTHING`, so a `roundId` raced between two games ends as a typed `409
round_conflict`, never as a unique violation.

Both uuids, the game id in the path and `roundId`, are accepted in any letter case and normalised to lowercase by
the contract, the spelling Postgres returns, so a retry spelled differently is still a repeat. `gameScore` in the
answer is a sum and may exceed the range of one round's `score`.

The previous `GET /api/games` (every game with every column, no caller) and the public game-creation routes have no
successor.

## Runtimes and entries

| Entry              | Runs                                                                                                                                                                                         | Database                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `entry/node.ts`    | `@hono/node-server`, both apps on one port, `.env` through `dotenv-flow` in development                                                                                                      | two `pg.Pool`s for the process (`adrs/session-store-locking.md`)                          |
| `entry/worker.ts`  | `fetch` dispatching on the request hostname (public hostname → public app, internal hostname → internal app, else 404); a `WorkerEntrypoint` for service bindings; `scheduled` for the sweep | per-request `pg` clients on two cache-disabled Hyperdrive bindings, closed in `waitUntil` |
| `entry/migrate.ts` | Kysely `Migrator`, `migrateToLatest()`, result inspected, exits non-zero on failure                                                                                                          | `DATABASE_URL` (the database section of the configuration only)                           |
| `entry/sweep.ts`   | expired `auth_requests` and sessions past the cookie grace, each session under its lock                                                                                                      | `DATABASE_URL`; scheduled by whatever runs the Node entry                                 |

Locally: Postgres from the root `docker-compose.yml`, the entries from the host (`pnpm start:dev` runs
`entry/node.ts` under `tsx watch`; `pnpm dev:worker` runs `cf dev`, which drives `wrangler dev` from
`cloudflare.config.ts`, with the Hyperdrive bindings' `dev.connectionString` pointing at the same database). Nothing
of this service runs inside Docker in development. `DATABASE_URL` comes from this package's `.env.development`
(overridable in `.env.development.local`), not from the root files, which CAS reads for its own database;
`migrate`, `db:codegen` and the Node entry resolve it through one loader (`src/entry/env.ts`, `MIGRATIONS.md`). The
development `LIGRETTO_INTERNAL_API_TOKEN` comes from the root `.env.development` for the Node entry and from this
package's `.dev.vars` for `cf dev` and the Worker suite; both hold the same public-by-construction value. The
root `pnpm ligretto:start` leaves this package out until the cutover from `ligretto-core-backend`: both serve port 3333.

## Deployment

Cloudflare Workers, the way CAS is deployed (`apps/cas/cloudflare.config.ts`, `cas-deploy.yml`): a release
workflow builds the Worker, applies the migrations with `entry/migrate.ts` against the production `DATABASE_URL`
(an Actions secret of the release environment), then uploads with `cf deploy --prebuilt`. The database is Neon
behind **two cache-disabled Hyperdrive configurations** (`HYPERDRIVE_MAIN`, `HYPERDRIVE_LOCKS`,
`adrs/database-access-with-kysely.md`), budgeted together against the Neon plan's connection limit. Worker secrets:
`LIGRETTO_CAS_CLIENT_SECRET`, `LIGRETTO_INTERNAL_API_TOKEN`. The public hostname follows ligretto's production
origin layout, an open question in `apps/cas/docs/PLAN.md`: one origin with the SPA and `/api/*` under the cookie
transport, or separate hosts under the bearer transport. The internal app answers on a
dedicated hostname, since the gameplay backend is not a Worker and cannot use a service binding; the shared secret
is what protects it on either path. The sweep runs from a Workers cron trigger (`scheduled` in `entry/worker.ts`);
`entry/sweep.ts` remains for any other runtime. The Node image (`.docker/Ligretto-core-backend_Dockerfile`) keeps
being built in CI as the packaging of the Node entry.

## CI (per pull request)

- lint, format, `tsc`, vitest (PGlite suites); the store suite against the job's Postgres;
- both entries smoke-tested (`/health`): Node booted, the Worker under `workerd` through `@cloudflare/vitest-plugin`;
- `openapi.json`, `openapi.internal.json` and `schema.generated.ts` regenerated and diffed against the commit (the
  `openapi` job runs `pnpm openapi:generate`, `schema-codegen` runs `pnpm db:codegen`);
- the compatibility matrix and the migration checks (`adrs/additive-migrations-and-compatibility-matrix.md`);
- `packages/ligretto-core-client` regenerated from the committed documents and type-checked, with its contract
  tests against `app.request()`.

## Consumers and the activation order

- `apps/ligretto-gameplay-backend` → `@memebattle/ligretto-core-client/internal` with the shared secret; it mints
  `roundId` when a round finishes and keeps it, with the frozen results, across retries.
- `apps/ligretto-frontend` → `@memebattle/ligretto-core-client` for `/api/users` (with the access token
  `/api/auth/me` returns) and the `/api/auth/*` navigations.
- `packages/ligretto-shared/apiTypes.ts` is deleted when both are on the generated client.

The consumers' new calls (`/internal/*`, `sub`/`name` in users) do not exist on the old package, so switching a
consumer and keeping CI's e2e on the old package cannot both hold. The e2e job of `ligretto-pr.yml` is disabled
(`if: false`) until #817; whatever its state, the rule is: the consumer switches (#840, #841) and the re-pointing of
CI, e2e and the image at this package (#842) land as one activation, with the e2e job enabled only against the
compatible combination. Preparation (the client package, the frontend's auth flow) lands independently before it.

## Later, outside the milestone

- CAS `client_credentials` grant; the internal middleware switches from the shared secret to
  `verifyAccessToken` + `client_id` (`adrs/internal-api-and-service-authentication.md`).
