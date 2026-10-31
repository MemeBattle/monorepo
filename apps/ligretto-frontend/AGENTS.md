# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

The ligretto-core API is called only through `@memebattle/ligretto-core-client`, in `src/shared/api`. Its base, the root `LIGRETTO_CORE_URL`, is an origin without `/api`, because the generated paths start with `/api`. It is set only in development and tests: in production it stays unset, and the SPA calls the API on its own origin.

## Build and release

`pnpm build:worker` runs `vite build`, then `cf-wrangler build --mode production`, into `.cloudflare/output`: the SPA as an
assets-only Worker, `ligretto-frontend`, on the route `ligretto.app/*` (`cloudflare.config.ts`, `wrangler.config.ts`). It
has no Worker code, bindings or secrets. Not `cf build`: in this package it detects Vite and delegates to `vite build`,
which writes no Build Output. The SPA's build values come from the root `.env` / `.env.production`; the Worker's
production values are in `cloudflare.config.ts`. `.github/workflows/ligretto-release.yml` releases it last, after
ligretto-core-backend, so a new SPA never meets an old API. `.github/workflows/ligretto-frontend-pr.yml` runs `ts-check`,
`test:ci` and `build:worker` on every pull request that touches this package or the workspace packages it is built from.
Development keeps the vite dev server.

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts` and `cloudflare.config.spec.ts` beside `src`).
- `pnpm e2e:start` — e2e (Playwright). The vite dev server is started by `webServer` in `playwright.config.ts` (one already running on :5173 is reused); the app renders routes only after `GET /api/auth/me` responds. `e2e/tests/onboarding.spec.ts` stubs that call and needs no backend. `e2e/tests/game.spec.ts` needs CAS, the core backend, the gameplay backend, and the frontend on `:5174` with `LIGRETTO_APP_URL=http://localhost:5174`. Locally that is the local SSO stack, CAS seeded with `apps/cas/scripts/seed-dev.sh`. In CI, the e2e job of `ligretto-pr.yml` runs it against the production CAS through the confidential client `ligretto-ci`: the job sets `CAS_ISSUER`, `LIGRETTO_CAS_CLIENT_ID` and `LIGRETTO_CAS_CLIENT_SECRET`, and builds no CAS.
