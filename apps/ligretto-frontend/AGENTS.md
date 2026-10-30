# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

The ligretto-core API is called only through `@memebattle/ligretto-core-client`, in `src/shared/api`. Its base, the root `LIGRETTO_CORE_URL`, is an origin without `/api`, because the generated paths start with `/api`.

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm e2e:start` — e2e (Playwright). The vite dev server is started by `webServer` in `playwright.config.ts` (one already running on :5173 is reused); the app renders routes only after `GET /api/auth/me` responds. `e2e/tests/onboarding.spec.ts` stubs that call and needs no backend. `e2e/tests/game.spec.ts` needs the local SSO stack: CAS seeded with `apps/cas/scripts/seed-dev.sh`, the core backend, the gameplay backend, and the frontend on `:5174` with `LIGRETTO_APP_URL=http://localhost:5174`.
