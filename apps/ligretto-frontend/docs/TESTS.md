# Tests

The repository [guidelines](../../../docs/guidelines.md) apply: unit tests cover behaviour, none for declarative code
or configuration. This page says what that means in this package and how to run the checks.

## Commands

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm e2e:start` — e2e (Playwright). The vite dev server is started by `webServer` in `playwright.config.ts` (one
  already running on :5173 is reused); the app renders routes only after `GET /api/auth/me` responds.
  `e2e/tests/onboarding.spec.ts` stubs that call and needs no backend. `e2e/tests/game.spec.ts` needs CAS, the core
  backend, the gameplay backend, and the frontend on `:5174` with `LIGRETTO_APP_URL=http://localhost:5174`. Locally
  that is the local SSO stack, CAS seeded with `apps/cas/scripts/seed-dev.sh`. In CI, the e2e job of
  `ligretto-pr.yml` runs it against the production CAS through the confidential client `ligretto-ci`: the job sets
  `CAS_ISSUER`, `LIGRETTO_CAS_CLIENT_ID` and `LIGRETTO_CAS_CLIENT_SECRET`, and builds no CAS.

## What gets a unit test

- Pure logic: reducers and slices, selectors, state machines, helpers. A test calls the function with an input and
  asserts the output (`src/features/onboarding/model/fsm.spec.ts`, `src/shared/api/describeFailure.spec.ts`).
- Screens, widgets and features, from the user's point of view. The test renders the component with
  `@testing-library/react`, with a store from `#testing/lib/createMockStore` preloaded with the state the screen needs,
  then acts as the user (clicks, key presses) and asserts what the user sees or which action the screen dispatches
  (`src/widgets/game/ui/GameContainer.spec.tsx`, `src/widgets/user-info/ui/UserInfo.spec.tsx`). It never reaches
  into component internals: no hooks called directly, no implementation-level assertions.

## What gets no unit test

- Store listeners (`src/ducks/*/listeners.ts`, `src/features/*/model/listeners.ts`,
  `src/entities/socket/model/listeners.ts`). A listener is wiring between actions, the API and the socket; a test of
  it dispatches an action against mocked `fetch` and asserts the store afterwards, which restates the listener and
  breaks on every rewiring. When the logic a listener carries is worth covering, cover it from the user's point of
  view: render the screen the user would be on, trigger what the user does, assert what the user sees. When a flow
  spans the API and the socket and no single screen shows it, it is an e2e scenario, not a unit test. Logic that
  deserves a test of its own is extracted into a pure function and tested there.
- Declarative code: markup without logic, route tables, type and schema declarations, lists of constants.
- Configuration: `vite.config.ts`, `playwright.config.ts`, `cloudflare.config.ts`, `wrangler.config.ts`, the env
  files.
