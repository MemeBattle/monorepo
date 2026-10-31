# ligretto-core-backend

The HTTP service of Ligretto: sign-in through CAS, user profiles, games and rounds for the gameplay backend. This file
holds the operational notes for production. `AGENTS.md` lists the design documents, and
`docs/adrs/production-deployment-on-workers.md` records why the deployment has this shape.

## What runs where

Ligretto is separate Workers sharing `ligretto.app` through Workers Routes; the most specific pattern wins.

- **Public app:** this Worker, on the routes `ligretto.app/api*`, `ligretto.app/health*` and `ligretto.app/openapi.json*`.
  Each ends in `*` because a route pattern matches the query string too. The cookie transport is first-party, and
  production allows no CORS origin.
- **SPA:** the `ligretto-frontend` Worker on `ligretto.app/*`, an assets-only Worker with the SPA fallback for deep links
  (`apps/ligretto-frontend/cloudflare.config.ts`). Its requests never run Worker code.
- **Internal app:** `https://core-internal.ligretto.app`, this Worker's Custom Domain: the `/internal` routes the gameplay
  backend calls with the shared secret. This Worker has no assets, so the hostname never serves the SPA. Any other
  hostname, `workers.dev` included, is refused.
- **Gameplay:** `ligretto.app/gameplay/*` is reserved for the gameplay Worker. Until it is one, the gameplay backend stays
  on Kubernetes at `api.ligretto.app`, and no workflow deploys it.
- **Sweep:** this Worker's `scheduled` handler, on a cron trigger.
- **Database:** Neon, reached at runtime only through two cache-disabled Hyperdrive configurations. Migrations run from
  the release job over the direct connection.

## Resources

| Resource                      | Name or value                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare account            | `2155fed9f68a1bc94fab7d9e5bb6eaac`                                                                                                                           |
| Workers                       | `ligretto-core-backend`, `ligretto-frontend` (not created yet)                                                                                               |
| Zone                          | `ligretto.app` (`3e680b95d1452e8426479e3ec52e3df8`)                                                                                                          |
| Routes                        | `ligretto.app/api*`, `ligretto.app/health*`, `ligretto.app/openapi.json*` → `ligretto-core-backend`; `ligretto.app/*` → `ligretto-frontend`                  |
| Custom Domain                 | `core-internal.ligretto.app` → `ligretto-core-backend`                                                                                                       |
| DNS                           | `A ligretto.app → 192.0.2.1`, proxied, a placeholder created by hand; `A api.ligretto.app` stays for the gameplay backend                                    |
| Cron                          | `7 * * * *`                                                                                                                                                  |
| Hyperdrive `HYPERDRIVE_MAIN`  | `ligretto-core-neon-main`, `1ce28ac44ae848aea317d36c3dc828c5`, `origin_connection_limit` 15                                                                  |
| Hyperdrive `HYPERDRIVE_LOCKS` | `ligretto-core-neon-locks`, `fa5cbf397388476086cddacaca0bc77a`, `origin_connection_limit` 10                                                                 |
| CAS clients                   | `ligretto` for production; `ligretto-ci` for the e2e job of `ligretto-pr.yml`, redirect `http://localhost:3333/api/auth/callback`                            |
| Worker secrets                | `DATABASE_URL`, `LIGRETTO_INTERNAL_API_TOKEN`, `LIGRETTO_CAS_CLIENT_SECRET`, all on `ligretto-core-backend`                                                  |
| `Ligretto-production` secrets | `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`                                                                                                                       |
| Repository secrets            | `SENTRY_AUTH_TOKEN`, read by the source map upload of the `release` job alone; `LIGRETTO_CI_CAS_CLIENT_SECRET`, read by the e2e job                          |
| Kubernetes Secret             | `ligretto-gameplay-backend-internal-api` in namespace `ligretto-gameplay-backend`, keys `LIGRETTO_INTERNAL_API_TOKEN` and `LIGRETTO_INTERNAL_API_TOKEN_NEXT` |

The Worker holds `DATABASE_URL` and reads it nowhere: the runtime connects only through Hyperdrive. Secret values live
only in Cloudflare, GitHub, Kubernetes and the password manager, never in this repository.

All `cf` commands below run from this directory with the account selected:

```sh
export CLOUDFLARE_ACCOUNT_ID=2155fed9f68a1bc94fab7d9e5bb6eaac
```

## Connection budget

The two configurations are limits on one database, so they are budgeted together. The rule is
`main + locks + any other client of the same compute <= half of (max_connections - superuser_reserved_connections)`.
The other half is headroom for migrations, hand-run sessions and Hyperdrive's soft limit. This database does not share
a compute with `cas-neon`, so nothing else counts today.

The limits are `main = 15` and `locks = 10`. The limit of the database is **unmeasured**. Measure it, and if the rule
fails, keep the 3:2 ratio and lower both:

```sh
psql "$DATABASE_URL" -Atc "select current_setting('max_connections')::int - current_setting('superuser_reserved_connections')::int"
pnpm exec cf hyperdrive update <id> --origin-connection-limit <limit>
```

## First activation

The first release is the activation. Until it runs, no application version is live and no route, domain or cron is
attached. Every prerequisite below ends with a real value, never a placeholder, so a secret present on the Worker stands
for a finished prerequisite. `scripts/check-release.sh` and the frontend Worker check stop a release before the schema
until all of them are done, so merging early is safe.

1. Add `CLOUDFLARE_API_TOKEN` to the `Ligretto-production` environment: an account-owned token (Manage Account → Account
   API Tokens) with exactly these permissions and nothing else. The legacy `Workers Scripts` permissions are replaced by
   the Workers roles; the workflow sets `CLOUDFLARE_ACCOUNT_ID`, so `cf` skips the account lookup that needed
   `Memberships Read` and `User Details Read`, and `Editor` already includes what `Workers Tail Read` granted.
   - **Account → Workers → Editor** at the Workers product scope: uploads versions, deploys, reads Workers, secrets and
     schedules. `Editor` cannot create a Worker, which is why items 4 and 5 create both by hand. Per-Worker scope does not
     carry Custom Domains yet.
   - **Account → Hyperdrive → Read**: `scripts/check-release.sh` reads both configurations; Workers roles do not extend
     to Hyperdrive.
   - **Zone → Workers Routes → Edit**, scoped to `ligretto.app` only: every deploy computes the changeset of its routes,
     the four of the two Workers, and of the Custom Domain.
   - **Zone → Zone → Read**, scoped to `ligretto.app` only: every deploy of either Worker resolves the zone of its routes
     by name (`GET /zones?name=ligretto.app`), and that endpoint accepts no other permission.
2. Register the CAS client. Here `DATABASE_URL` is CAS's own database, the `CAS_DATABASE_URL` secret of `CAS-production`.
   The command prints the client secret once.

   ```sh
   cd apps/cas
   DATABASE_URL='<the CAS_DATABASE_URL value>' cargo run -p cas --bin cas-client -- register \
     --id ligretto --name Ligretto --kind confidential \
     --redirect-uri https://ligretto.app/api/auth/callback \
     --post-logout-redirect-uri https://ligretto.app/ \
     --first-party --guest-login-allowed \
     --scope openid --scope profile --scope email --audience ligretto
   ```

3. Generate the two internal values, create the Kubernetes Secret and keep both in the password manager. The active value
   is the one the Worker gets; the spare is what the next rotation starts from, and no pod reads it.

   ```sh
   token() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }
   active="$(token)"; next="$(token)"
   kubectl -n ligretto-gameplay-backend create secret generic ligretto-gameplay-backend-internal-api \
     --from-literal=LIGRETTO_INTERNAL_API_TOKEN="$active" --from-literal=LIGRETTO_INTERNAL_API_TOKEN_NEXT="$next"
   ```

4. Create the inert Worker that holds the secrets, once. `cf deploy` refuses a declared secret on a Worker that does not
   exist, and only `--secrets-file` can set one at creation. This Worker has no bindings, no routes, no cron and no
   `workers.dev` hostname, and it answers `503` to anything.

   **Never run this recipe after the first release: it would replace the application with that `503`.**

   ```sh
   mkdir -p .cloudflare/bootstrap && cd .cloudflare/bootstrap
   ln -s ../../node_modules node_modules
   echo '{ "name": "bootstrap", "private": true, "type": "module", "devDependencies": { "wrangler": "*" } }' > package.json
   printf 'export default { fetch: () => new Response("not released", { status: 503 }) }\n' > worker.js
   cat > cloudflare.config.ts <<'CONFIG'
   import { defineConfig } from 'cf/config'
   export default defineConfig({ worker: { name: 'ligretto-core-backend', compatibilityDate: '2026-08-04', entrypoint: 'worker.js', workersDev: false } })
   CONFIG
   # A JSON object of the three secrets, in a 0600 file outside the repository.
   pnpm exec cf deploy --secrets-file "$secrets_file" --tag bootstrap --message 'inert holder for the secrets'
   cd ../.. && rm -rf .cloudflare/bootstrap "$secrets_file"
   ```

5. Create the inert `ligretto-frontend` Worker the same way, once, because the deploy token cannot create it. Run the
   recipe of item 4 with `name: 'ligretto-frontend'` and without `--secrets-file`: this Worker has no secret. The same
   warning holds: never after the first release.
6. Check the prerequisites with the release token in `CLOUDFLARE_API_TOKEN`. Exit 0 from the last three commands means
   the first release can go ahead; the last one is the zone lookup every deploy makes.

   ```sh
   pnpm build:worker
   pnpm exec scripts/check-release.sh
   pnpm exec cf workers get ligretto-frontend > /dev/null
   curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/zones?name=ligretto.app&account.id=$CLOUDFLARE_ACCOUNT_ID" \
     | jq -e '.result | length == 1' > /dev/null
   ```

7. Prepare the DNS while `ligretto.app` still points at the Yandex CDN. Delete the `_acme-challenge.ligretto.app` CNAME,
   which can interfere with the validation, and check that the zone's Universal certificate covers `ligretto.app`.
8. Approve the one `Ligretto release` run. It attaches the routes of both Workers and the Custom Domain while the
   `ligretto.app` record is still DNS-only, so no request reaches them yet.
9. Replace the Yandex `CNAME ligretto.app` with the proxied placeholder `A ligretto.app → 192.0.2.1`; from then on the
   routes answer. Delete the `A core` record.

No release touches DNS. A route needs a proxied record on its hostname, and Cloudflare refuses a Custom Domain over a
hostname that has an externally managed record (error `100117`), so the records are changed by hand as above. The `api`
record stays: it is the gameplay backend.

Then allow ten minutes for certificates, and check:

- `/health` answers `200` on `ligretto.app` and on `core-internal.ligretto.app`, and so does `/health?probe=1` on
  `ligretto.app`, with the core's JSON, not the SPA. It proves nothing about the schema: it selects a constant.
- `POST https://core-internal.ligretto.app/internal/games` with no token answers `401 invalid_internal_token`.
- `GET https://ligretto.app/internal/games` answers the SPA's `index.html`: the path is not routed to this Worker.
- `GET https://ligretto.app/` and a deep link such as `GET https://ligretto.app/game/some-id` answer the SPA's `index.html`.
- `GET https://core-internal.ligretto.app/` answers `404` JSON, not the SPA. This invariant is Cloudflare configuration,
  so it is checked here and not by the Worker suite.
- `GET https://ligretto.app/api/auth/sign-in` answers `302` to `cas.mems.fun`, or `200` with that URL. It writes to
  `auth_requests`, which proves the migrated schema through Hyperdrive.
- `GET https://ligretto.app/openapi.json` answers the public document.
- `pnpm exec cf workers get ligretto-core-backend` lists `core-internal.ligretto.app` under `.references.domains`, and
  `pnpm exec cf workers get ligretto-frontend` answers.
- The first run in the core Worker's Cron Events tab has no `sweep_failed`.

Then `helm uninstall` the old `ligretto-core-backend` release. After the cutover the `AWS_*` repository secrets and the
Yandex bucket have no user.

To go back before anything else depends on the layout, delete the four routes and recreate the `CNAME ligretto.app` to
`6df4977bd2611eed.topology.gslb.yccdn.ru`, DNS-only.

## Releases

A push to `master` that touches this package, `apps/ligretto-frontend`, the workspace packages either of them is built
from, the root `.env*` files, the lockfile, the workspace file or the workflow starts `.github/workflows/ligretto-release.yml`.
It can also be started by hand.

1. `cancel-stale` cancels every older run of the workflow on the same branch that is still waiting for the approval or
   queued. A run in progress is never touched, and a run started by hand on another branch never touches a `master` run.
2. `build-core` and `build-frontend` build in parallel with no secrets: `pnpm build:worker` of each package, into its own
   Build Output. The SPA's non-secret values come from the root `.env.production`. A failed build stops everything.
3. The `release` job waits for the approval of `Ligretto-production`, one approval for both Workers.
4. It fails with `superseded by run <id>` when a newer run of the same branch that is not cancelled exists: a run still
   building when the newer one started escapes the cancellation. A failed run listing fails the step too.
5. `scripts/check-release.sh` reads the built core Worker: both Hyperdrive configurations are cache-disabled and every
   declared secret is set. Then `cf workers get ligretto-frontend` checks that the frontend Worker exists. A failure
   leaves the schema alone.
6. `pnpm migrate` applies the migrations over the direct `DATABASE_URL`. A failure stops the uploads.
7. `cf deploy --prebuilt --mode production` uploads the core and attaches its routes, the Custom Domain and the cron.
8. The same command uploads the frontend last, so a new SPA never meets an old API, and attaches its route.
9. `sentry-cli` uploads the SPA's source maps from the frontend artefact, under the release `LIGRETTO_APP_VERSION`, and
   finalizes that release.

The upload to Sentry needs `SENTRY_AUTH_TOKEN`, so it cannot run in the builds, which have no secrets. It runs last, from
the artefact the release has already checked, and `continue-on-error` keeps it from deciding a release: a failure shows as
an annotated step. The maps stay public in the assets, as they were on the bucket. A `pnpm build:worker` in a terminal has
no `LIGRETTO_APP_VERSION`, so a release by hand reports no Sentry release, which is harmless.

The step finalizes the Sentry release, so "resolve in next release" has a release date to order by. It associates no commits:
`sentry-cli releases set-commits` needs the git history, and the checkout of the `release` job, which holds the production
secrets, is shallow.

A rerun after a failure is safe: a second migrate applies nothing, and an upload of the same version changes nothing.

Whether `cf workers secrets update` makes the next CI deploy abort has not been tested. `cf deploy` is strict and refuses
in CI when the Worker was last changed through the API. If a release fails with "Aborting the upload operation because of
conflicts", run `pnpm build:worker` and `pnpm exec cf deploy --prebuilt --mode production` once from a terminal on
`master` and answer yes.

## Rotating the internal secret

Two values are accepted during a rotation, so there is no window without a valid token
(`docs/adrs/internal-api-and-service-authentication.md`). Keep the new value in the password manager first.

1. Add the new value to the Worker, beside the current one:

   ```sh
   pnpm exec cf workers secrets update LIGRETTO_INTERNAL_API_TOKEN --worker ligretto-core-backend --type secret_text --text "$active,$next"
   ```

2. Switch the gameplay backend. Generate a new spare for the second key, then restart:

   ```sh
   kubectl -n ligretto-gameplay-backend create secret generic ligretto-gameplay-backend-internal-api \
     --from-literal=LIGRETTO_INTERNAL_API_TOKEN="$next" --from-literal=LIGRETTO_INTERNAL_API_TOKEN_NEXT="$spare" \
     --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n ligretto-gameplay-backend rollout restart deployment
   kubectl -n ligretto-gameplay-backend rollout status deployment
   ```

3. Remove the old value from the Worker:

   ```sh
   pnpm exec cf workers secrets update LIGRETTO_INTERNAL_API_TOKEN --worker ligretto-core-backend --type secret_text --text "$next"
   ```

A value must not contain a comma: the list is comma-separated.

## Replacing the CAS client

CAS has no rotation, so a lost or leaked client secret means registering a new client id
(`apps/cas/docs/INTEGRATION.md`). CAS refuses a refresh token issued to another client, so every existing session ends
at its next refresh. Registered users sign in again, and a guest gets a new subject and loses the previous identity. A
sign-in in progress fails. CAS has no deletion either, so the old id stays registered and its secret stays valid.

The id and the secret must reach the Worker in one version: either one alone makes CAS refuse the Worker's calls. So do
not use `cf workers secrets update` here. It takes effect at once, and the id arrives only with an upload.

1. Register the new id with `cas-client register` as in the first activation, with the same `--audience ligretto`, which
   is what the service verifies access tokens against. Keep the printed secret in the password manager, and write it as
   the JSON object `{ "LIGRETTO_CAS_CLIENT_SECRET": "<value>" }` to a `0600` file outside the repository.
2. Merge the new `LIGRETTO_CAS_CLIENT_ID` in `cloudflare.config.ts` as the only change since the last release. Do not
   approve the release it starts: that upload alone would pair the new id with the old secret.
3. From a clean checkout of that commit, upload both together. The Worker's other secrets are inherited.

   ```sh
   pnpm build:worker
   pnpm exec cf deploy --prebuilt --mode production --secrets-file "$secrets_file"
   rm "$secrets_file"
   ```

4. Approve the waiting release. It uploads the same Worker and inherits the new secret.

## Running a migration by hand

The release does this, so a hand run is for recovery. Run it from a clean checkout of `master`, so nothing unmerged reaches
the production schema, and not while a release is running. Use the direct connection, never Hyperdrive or the pooler:
`DATABASE_URL` from `~/.config/ligretto/production.env` or the password manager.

```sh
DATABASE_URL='<the direct connection string>' NODE_ENV=production pnpm migrate
```

It logs one `migration` line per applied migration, or `no pending migrations`, and exits non-zero on `migration_failed`.
`docs/MIGRATIONS.md` has the rules.

## Running the sweep by hand

The cron does this hourly. To run it once from a checkout:

```sh
DATABASE_URL='<the direct connection string>' NODE_ENV=production pnpm sweep
```

## Logs

- **The service:** Workers observability in the Cloudflare dashboard, Workers & Pages, `ligretto-core-backend`,
  Observability. One JSON line per request and structured lines for errors (`docs/adrs/logging.md`).
- **The sweep:** the Worker's Cron Events tab shows each invocation, and a failed one is an exception. Search the logs for
  `sweep_completed`, `sweep_sessions_left` and `sweep_failed`.
- **The migrations:** the `Apply migrations` step of the release run, with its `migration`, `no pending migrations` and
  `migration_failed` lines.

## Rollback

Put a previous version of each Worker back on the traffic, the frontend first, so an old API never meets a new SPA.
Migrations stay applied: the compatibility window of `docs/MIGRATIONS.md` keeps the previous code working on the newer
schema. A frontend version carries its assets, so the SPA moves with it. Run the same commands with
`ligretto-frontend` for the frontend:

```sh
pnpm exec cf workers versions list --worker-id ligretto-core-backend
pnpm exec cf workers deployments create --worker ligretto-core-backend --strategy percentage \
  --versions '[{"version_id":"<version id>","percentage":100}]'
```
