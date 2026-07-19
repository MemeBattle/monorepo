# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm exec playwright test onboarding` — onboarding e2e. **No backend required**: playwright starts the vite dev server itself (`webServer` in `playwright.config.ts`) and reuses one already running on :5173; the auth request (`/auth/me`) is stubbed by the test via `page.route`.
- `pnpm e2e:start` — all e2e; `e2e/tests/game.spec.ts` requires running backends (core + gameplay) and fails without them — for an isolated frontend check run only `onboarding`.

Lint/format — from the repo root: `pnpm lint:check`, `pnpm fmt:check`.

## Onboarding (`/onboarding`)

- FSM built on `@fsmoothy/core`: `src/features/onboarding/model/fsm.ts`; redux layer — `slice.ts` + `listeners.ts` (the listener catches route entry, drives the FSM and mirrors its state into the store).
- Every property of a step (raised layers, "next" button visibility, highlights, description text and kind) lives in one place: `src/pages/onboarding/stepConfig.ts`.
- The page exposes e2e hooks: `data-test-id="OnboardingPage"` with a `data-onboarding-step={step}` attribute (values — the `OnboardingStep` enum), buttons/cards — `OnboardingPage-*` (see `OnboardingPage.page-object.ts`).
- The whole app (onboarding included) works behind authorization: routes render only after `/auth/me` responds. E2e stubs the authorization.

## Conventions

- Code comments and agent docs (this file) — English only. UI copy — Russian.
