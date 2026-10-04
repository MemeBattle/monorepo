# Tests

All commands run from `apps/cas-frontend`; lint and format run from the repo
root.

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests: vitest, `src/**/*.spec.{ts,tsx}`. `pnpm test`
  runs them in watch mode.
- `pnpm lint:check` / `pnpm fmt:check` from the repo root — oxlint and oxfmt,
  configured once for the whole monorepo. Both skip
  `src/shared/api/generated/`, which is kubb's output.

## The generated API client

`src/shared/api/generated/` is generated from `apps/cas/openapi.json`
(`adr/0004-generated-api-client.md`) and committed. After the description
changes, run `pnpm generate:api` and commit the result with it; never edit
the output by hand. CI does not compare the committed output with a fresh
one: the `typecheck` job in `.github/workflows/cas-frontend-pr.yml` runs
`generate:api` and then the type check, so what it proves is that the app
compiles against the description as it is in that commit. A description
change that breaks a call or a code a screen branches on fails there, with
or without a regeneration. The workflow runs on `apps/cas/**` changes too.

## What gets a unit test

Logic that can be wrong on its own: the API client and error mapping, form
actions, anything that turns an API response into what a screen shows.
Rendering a placeholder or a static route table does not; that is what the
type checker and the build are for.

Component tests render with `@testing-library/react` and drive the page with
`@testing-library/user-event`; vitest runs every spec in the `jsdom`
environment. There are no vitest globals, so a spec that renders calls
`cleanup()` in its `afterEach`. A screen that needs the router renders inside
`createMemoryRouter`, and the entity it calls is mocked with `vi.mock`, so the
spec exercises the form action and what it shows, not the network.

## Stories

Every primitive in `shared/ui` has a story next to it covering its states;
a screen state that is only a composition of primitives is a story too. The
root Storybook picks them up (`pnpm storybook` / `pnpm build-storybook` from
the repo root), Chromatic on the PR gives the visual review, and the a11y
addon runs axe on every story: a story with a violation is a bug in the
primitive, not in the story.

## End-to-end

`pnpm test:e2e` — Playwright, `e2e/*.e2e.ts`, Chromium only. The suite runs
the real ceremonies against a real CAS and Postgres: nothing is mocked, the
passkeys live on a virtual authenticator that Chromium provides over CDP
(`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`). Every test creates
its own account, so the tests run side by side against one CAS and leave
their rows behind; there is no cleanup.

Running it needs CAS up, with its database migrated. The dev database from
`apps/cas/docker-compose.yml` is fine, but the accounts the suite makes pile
up, so a database of its own is better. From the repo root:

```sh
docker compose -f apps/cas/docker-compose.yml up -d
psql postgres://cas:cas@localhost:5434/cas -c 'CREATE DATABASE cas_e2e;'
export DATABASE_URL=postgres://cas:cas@localhost:5434/cas_e2e
export SQLX_OFFLINE=true
cargo run -p cas --bin cas-migrate
./apps/cas-frontend/e2e/seed.sh
cargo run -p cas
```

`SQLX_OFFLINE` makes cargo compile the query macros from `apps/cas/.sqlx`,
since a fresh database has no tables yet (see `apps/cas/docs/MIGRATIONS.md`).
`e2e/seed.sh` registers the two OIDC clients the suite uses: the public
`cas-frontend-e2e` of the authorize scenarios, and the confidential
`cas-frontend-e2e-guest` of the guest scenarios, whose secret it writes to
`e2e/.guest-client-secret` (gitignored, never printed). Like
`apps/cas/scripts/seed-dev.sh` it is not idempotent: it attempts both
clients, and "already exists" on a second run means a client is there.

CAS keeps only a hash of a client's secret, so the secret file and the client
belong together: a database seeded from another checkout has the guest client
but not the file here. The script says so; delete the client
(`psql "$DATABASE_URL" -c "DELETE FROM clients WHERE id = 'cas-frontend-e2e-guest'"`)
or seed a fresh database, and run it again. A secret file left over from
another database fails the guest grant with `invalid_client` in the same way.

Then, from `apps/cas-frontend`, `pnpm test:e2e`. Playwright starts vite on
:5173 itself, or reuses the one already there; `CAS_API_PROXY_TARGET` points
the proxy (`/api` and `/oidc`) at a CAS on another address, as in development. `CAS_FRONTEND_PORT`
moves vite when 5173 is taken, in which case CAS must be started with
`CAS_ORIGIN` and `CAS_CORS_ORIGINS` set to the new origin, since the
relying-party origin is what the browser signs.

### The fixture

`e2e/fixtures.ts` attaches one virtual authenticator to the page before each
test: a platform authenticator (`transport: 'internal'`) with discoverable
credentials and user verification, which is what CAS asks for, that confirms
every prompt on its own. `authenticators.add()` and `.remove()` stand for
another device: a second passkey for an account is a swap, not an addition,
because a registration with two attached authenticators fails as
`InvalidStateError` as soon as either holds an excluded credential, the same
as with real ones. The `account` fixture creates an account and lands on the
dashboard.

Chromium answers the sign-in screen's autofill offer (conditional mediation)
with the virtual authenticator's discoverable credential as soon as it has
one, without a click: that is how the autofill scenario is driven, and the
test records the `mediation` of every `navigator.credentials.get()` to be
sure it was the offer, not the button, that signed in. The other side of it
is that the button cannot be tested while the offer stands, so the button
scenarios run with the option `autofill: false`, which is a browser without
conditional mediation (`isConditionalMediationAvailable` answers `false`),
the one the button is the fallback for in DESIGN.md.

### The authorize scenarios

`e2e/authorize.e2e.ts` runs the flows of `adr/0002-return-to.md`: from
`/oidc/authorize` through sign-in or create account and back to the client
with a code. The client's redirect URI is on a reserved TLD and nothing
serves it, so a scenario ends by catching the browser's request to it
(`page.waitForRequest`, armed before the action that leads there) and reading
`code` and `state` from its URL. A navigation to a host that does not resolve
commits no history entry, so the scenarios that check the history was
replaced on the way out use a `return_to` that does resolve, a document CAS
serves on this origin (`/oidc/jwks.json?forwarded`). When the first hop lands
on CAS's error page instead of sign-in, the e2e client is missing: run
`e2e/seed.sh`.

### The guest scenarios

`e2e/guest-upgrade.e2e.ts` runs the guest upgrade of
`adr/0003-guest-in-the-app.md`. A scenario mints a guest as an application's
backend would, with the guest grant of `cas-frontend-e2e-guest` at
`/oidc/token` (`mintGuest` in `e2e/authorization.ts`, the shared helpers of
the authorization request), and sends the browser to `/oidc/authorize` with
the guest's ID token as `id_token_hint`. One scenario creates the account
from there and returns to the client with a code; the other abandons the
upgrade, finds the guest dashboard, and finishes from its link. Both end on
the dashboard of a full account with one passkey, and check through
`/api/me` that it is the guest's own account (`sub`), upgraded rather than
created. A missing secret file fails them with "run e2e/seed.sh".

### In CI

The `e2e` job in `.github/workflows/cas-frontend-pr.yml`: the Postgres
service of `cas-pr.yml`, a debug build of `cas` and `cas-migrate`
(`Swatinem/rust-cache` keeps the target directory between runs), the e2e
clients registered with `e2e/seed.sh`, CAS started
in the background with its defaults, Chromium installed by Playwright, vite
started by Playwright's `webServer`. The workflow also runs on `apps/cas/**`
changes, since the suite tests the real backend. On failure the Playwright
report, the traces and CAS's log are uploaded as an artifact.
