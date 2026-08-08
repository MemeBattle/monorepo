# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm e2e:start` — e2e (Playwright). The vite dev server is started by `webServer` in `playwright.config.ts` (one already running on :5173 is reused); the core backend must be up — the app renders routes only after `/auth/me` responds. `e2e/tests/game.spec.ts` also requires the gameplay backend.
