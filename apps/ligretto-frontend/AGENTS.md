# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm exec playwright test onboarding` — onboarding e2e. Playwright starts the vite dev server itself (`webServer` in `playwright.config.ts`) and reuses one already running on :5173; the core backend must be up — the app renders routes only after `/auth/me` responds.
- `pnpm e2e:start` — all e2e; `e2e/tests/game.spec.ts` also requires the gameplay backend.

## Onboarding (`/onboarding`)

- FSM built on `@fsmoothy/core`: `src/features/onboarding/model/fsm.ts`; redux layer — `slice.ts` + `listeners.ts` (the listener catches route entry, drives the FSM and mirrors its state into the store).
- Every property of a step (raised layers, "next" button visibility, highlights, outlined zone, description text and kind) lives in one place: `src/pages/onboarding/stepConfig.ts`.
- The page exposes e2e hooks: `data-test-id="OnboardingPage"` with a `data-onboarding-step={step}` attribute (values — the `OnboardingStep` enum), buttons/cards — `OnboardingPage-*` (see `OnboardingPage.page-object.ts`).
- Floating decorations are positioned against a target element measured relative to the page container: description bubbles + arrows (`descriptions/*`, `useTargetRelativePosition`) and the hand-drawn loop `TargetOutline` (`useTargetRelativeRect`), which the intro steps wrap around the stack / row / ligretto deck via the config's `outlineTarget`.
- The whole app (onboarding included) works behind authorization: routes render only after `/auth/me` responds.
