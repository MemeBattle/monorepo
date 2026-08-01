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
- Two things keep a bubble on screen at any window size. `DescriptionBubble` caps its own `maxWidth` against the container edge it grows towards (the `align` field of `BubblePosition`), so the text rewraps instead of hanging off. And the side-anchored placements are used only while `useHasRoomBesidePlayground` reports a readable strip beside the playground — below roughly 1400px wide the bubble moves under the board instead (`BottomAnchoredDescription` → `useAboveCardsPanelPosition`, which measures the `playerCards` layer through the targets context). The playground step is the exception: on the desktop grid the board almost touches the panel, so its hint goes into the band above the board.
- Below the `md` breakpoint (`useIsNarrowLayout`) the board is a single column — opponents, playground, then the cards panel pinned to the bottom by `MobileGameGrid`. The player's cards reach `CardsPanel` through its `stack` / `rowCards` / `ligretto` slots.
- `pnpm exec playwright test onboarding` walks the flow twice: desktop (`chromium`) and phone (`mobile-chrome`).
- The whole app (onboarding included) works behind authorization: routes render only after `/auth/me` responds.
