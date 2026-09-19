# Tests

All commands run from `apps/cas-frontend`; lint and format run from the repo
root.

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests: vitest, `src/**/*.spec.{ts,tsx}`. `pnpm test`
  runs them in watch mode.
- `pnpm lint:check` / `pnpm fmt:check` from the repo root — oxlint and oxfmt,
  configured once for the whole monorepo.

## What gets a unit test

Logic that can be wrong on its own: the API wrapper and error mapping, form
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
cargo run -p cas --bin cas-migrate
cargo run -p cas
```

Then, from `apps/cas-frontend`, `pnpm test:e2e`. Playwright starts vite on
:5173 itself, or reuses the one already there; `CAS_API_PROXY_TARGET` points
the proxy at a CAS on another address, as in development. `CAS_FRONTEND_PORT`
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

### In CI

The `e2e` job in `.github/workflows/cas-frontend-pr.yml`: the Postgres
service of `cas-pr.yml`, a debug build of `cas` and `cas-migrate`
(`Swatinem/rust-cache` keeps the target directory between runs), CAS started
in the background with its defaults, Chromium installed by Playwright, vite
started by Playwright's `webServer`. The workflow also runs on `apps/cas/**`
changes, since the suite tests the real backend. On failure the Playwright
report, the traces and CAS's log are uploaded as an artifact.
