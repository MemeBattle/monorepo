# ligretto-core-backend

The HTTP service of Ligretto: sign-in through CAS, user profiles, games and rounds for the gameplay backend. This file
holds the operational notes for production. `AGENTS.md` lists the design documents, and
`docs/adrs/production-deployment-on-workers.md` records why the deployment has this shape.

## What runs where

- **Public app and SPA:** `https://ligretto.app`, one origin served by this Worker. `/api/*`, `/health` and `/openapi.json`
  run the public app. Every other `GET` or `HEAD` answers the `ligretto-frontend` SPA from the Worker's static assets, with
  the SPA fallback for deep links. The cookie transport is first-party, and production allows no CORS origin.
- **Internal app:** `https://core-internal.ligretto.app`, the `/internal` routes the gameplay backend calls with the
  shared secret. This hostname never serves an asset, whatever the path. Any other hostname, `workers.dev` included, is
  refused.
- **Sweep:** the Worker's `scheduled` handler, on a cron trigger.
- **Database:** Neon, reached at runtime only through two cache-disabled Hyperdrive configurations. Migrations run from
  the release job over the direct connection.

## Resources

| Resource                      | Name or value                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare account            | `2155fed9f68a1bc94fab7d9e5bb6eaac`                                                                                                                           |
| Worker                        | `ligretto-core-backend` (not created yet)                                                                                                                    |
| Zone                          | `ligretto.app` (`3e680b95d1452e8426479e3ec52e3df8`)                                                                                                          |
| Hostnames                     | `ligretto.app`, `core-internal.ligretto.app`                                                                                                                 |
| Cron                          | `7 * * * *`                                                                                                                                                  |
| Hyperdrive `HYPERDRIVE_MAIN`  | `ligretto-core-neon-main`, `1ce28ac44ae848aea317d36c3dc828c5`, `origin_connection_limit` 15                                                                  |
| Hyperdrive `HYPERDRIVE_LOCKS` | `ligretto-core-neon-locks`, `fa5cbf397388476086cddacaca0bc77a`, `origin_connection_limit` 10                                                                 |
| Worker secrets                | `DATABASE_URL`, `LIGRETTO_INTERNAL_API_TOKEN`, `LIGRETTO_CAS_CLIENT_SECRET`                                                                                  |
| `Ligretto-production` secrets | `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`                                                                                                                       |
| Repository secret             | `SENTRY_AUTH_TOKEN`, read by the source map upload of the `release` job alone                                                                                |
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

The first release is the activation. Until it runs, no application version is live and no domain or cron is attached.
Every prerequisite below ends with a real value, never a placeholder, so a secret present on the Worker stands for a
finished prerequisite. `scripts/check-release.sh` stops a release before the schema until all of them are done, so
merging early is safe.

1. Add `CLOUDFLARE_API_TOKEN` to the `Ligretto-production` environment: an account-owned token (Manage Account → Account
   API Tokens) with exactly these permissions and nothing else. The legacy `Workers Scripts` permissions are replaced by
   the Workers roles; the workflow sets `CLOUDFLARE_ACCOUNT_ID`, so `cf` skips the account lookup that needed
   `Memberships Read` and `User Details Read`, and `Editor` already includes what `Workers Tail Read` granted.
   - **Account → Workers → Editor** at the Workers product scope: uploads versions, deploys, reads secrets and schedules.
     `Editor` cannot create a Worker, which is why item 4 creates it by hand. Per-Worker scope does not carry Custom
     Domains yet.
   - **Account → Hyperdrive → Read**: `scripts/check-release.sh` reads both configurations; Workers roles do not extend
     to Hyperdrive.
   - **Zone → Workers Routes → Edit**, scoped to `ligretto.app` only: every deploy computes the Custom Domains changeset.
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

5. Check the prerequisites. Exit 0 means the first release can go ahead.

   ```sh
   pnpm build:worker
   pnpm exec scripts/check-release.sh
   ```

6. Approve the `Ligretto core backend release` run first, and the gameplay deploy of `Ligretto release` only after the
   checks of the next paragraph pass.

After the first release, allow ten minutes for certificates, then check:

- `/health` answers `200` on both hostnames. It proves nothing about the schema: it selects a constant.
- `POST https://core-internal.ligretto.app/internal/games` with no token answers `401 invalid_internal_token`.
- `POST https://ligretto.app/internal/games` answers `404`.
- `GET https://ligretto.app/` and a deep link such as `GET https://ligretto.app/game/some-id` answer the SPA's `index.html`.
- `GET https://core-internal.ligretto.app/` answers `404`, not the SPA.
- `GET https://ligretto.app/api/auth/sign-in` answers `302` to `cas.mems.fun`, or `200` with that URL. It writes to
  `auth_requests`, which proves the migrated schema through Hyperdrive.
- `pnpm exec cf workers get ligretto-core-backend` lists both hostnames under `.references.domains`.
- The first run in the Worker's Cron Events tab has no `sweep_failed`.

Then `helm uninstall` the old `ligretto-core-backend` release.

In Actions, `cf deploy` replaces the `CNAME ligretto.app` DNS record, which points at the Yandex CDN, by itself and without
a prompt. Nothing removes the two records this layout leaves behind: delete the `A core` record and the `_acme-challenge`
CNAME by hand once the checks pass. If the certificate stays pending past the ten minutes, remove the `_acme-challenge`
CNAME first. The `api` record stays: it is the gameplay backend. To go back, detach the domain and recreate the CNAME to
`6df4977bd2611eed.topology.gslb.yccdn.ru`, DNS-only. After the cutover the `AWS_*` repository secrets and the Yandex
bucket have no user.

## Releases

A push to `master` that touches this package, `apps/ligretto-frontend`, the workspace packages either of them depends on,
the root `.env` or `.env.production`, the lockfile or the workflow starts
`.github/workflows/ligretto-core-backend-deploy.yml`. It can also be started by hand.

1. `build-worker` builds with no secrets: `pnpm build:worker` builds the SPA, then the Worker, into one Build Output. The
   SPA's non-secret values come from the root `.env.production`. A failed build stops everything.
2. The `release` job waits for the approval of `Ligretto-production`.
3. `scripts/check-release.sh` reads the built Worker: both Hyperdrive configurations are cache-disabled and every declared
   secret is set. A failure leaves the schema alone.
4. `pnpm migrate` applies the migrations over the direct `DATABASE_URL`. A failure stops the upload.
5. `cf deploy --prebuilt --mode production` uploads the Worker with the SPA and attaches the domains and the cron.
6. `sentry-cli` uploads the SPA's source maps from the built artefact, under the release `LIGRETTO_APP_VERSION`, and
   finalizes that release.

The upload to Sentry needs `SENTRY_AUTH_TOKEN`, so it cannot run in `build-worker`, which has no secrets. It runs last, from
the artefact the release has already checked, and `continue-on-error` keeps it from deciding a release: a failure shows as
an annotated step. The maps stay public in the assets, as they were on the bucket. A `pnpm build:worker` in a terminal has
no `LIGRETTO_APP_VERSION`, so a release by hand reports no Sentry release, which is harmless.

The step finalizes the Sentry release, so "resolve in next release" has a release date to order by. It associates no commits:
`sentry-cli releases set-commits` needs the git history, and the checkout of the `release` job, which holds the production
secrets, is shallow.

A rerun after a failure is safe: a second migrate applies nothing.

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

Put a previous version back on the traffic. A Worker version carries its assets, so the SPA moves with it. Migrations stay
applied: the compatibility window of `docs/MIGRATIONS.md` keeps the previous code working on the newer schema.

```sh
pnpm exec cf workers versions list --worker-id ligretto-core-backend
pnpm exec cf workers deployments create --worker ligretto-core-backend --strategy percentage \
  --versions '[{"version_id":"<version id>","percentage":100}]'
```
