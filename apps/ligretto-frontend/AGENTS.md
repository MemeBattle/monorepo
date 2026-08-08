# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

## How to test (for agents too)

All commands run from `apps/ligretto-frontend`:

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest, `src/**/*.spec.ts`).
- `pnpm exec playwright test onboarding` — onboarding e2e. Playwright starts the vite dev server itself (`webServer` in `playwright.config.ts`) and reuses one already running on :5173; the core backend must be up — the app renders routes only after `/auth/me` responds.
- `pnpm e2e:start` — all e2e; `e2e/tests/game.spec.ts` also requires the gameplay backend.

## Onboarding (`/onboarding`)

- FSM built on `@fsmoothy/core`: `src/features/onboarding/model/fsm.ts`; redux layer — `slice.ts` + `listeners.ts` (the listener catches route entry, drives the FSM and mirrors its state into the store). Which moves are available is derived from the FSM (`getAllowedEvents` → `allowedEvents` in the store) — never restate it as booleans in the UI.
- The canonical walkthrough lives in `src/features/onboarding/model/script.ts` (`ONBOARDING_SCRIPT`): the FSM unit test, the Storybook snapshots (`src/pages/onboarding/snapshots.ts`) and the e2e test all replay this single script.
- The hand deck is two piles: `stackDeck` (face down) and `stackOpenDeck` (face up, `[0]` — the top card). `NextStackCard` flips the top closed card onto the open pile; when the closed pile is empty, the same click turns the open pile back over (`CardsStack` shows a reshuffle icon on the empty deck place).
- The _presentation_ of a step (raised layers, "next" button visibility, highlights, outlined zone, description text/target/placement) lives in one place: `src/pages/onboarding/stepConfig.ts`.
- The page exposes e2e hooks: `data-test-id="OnboardingPage"` with a `data-onboarding-step={step}` attribute (values — the `OnboardingStep` enum), buttons/cards — `OnboardingPage-*` (see `OnboardingPage.page-object.ts`).
- Description bubbles are rendered by a single `descriptions/AnchoredDescription.tsx` driven by the config's `placement` (`aboveTarget` / `besidePlayground` / `playground`); positioning is `@floating-ui/react-dom` (`useFloating` + `offset` + `size`, the latter caps `maxWidth` against the container so the text rewraps instead of hanging off-screen). The opponents step is the one special case (`OpponentsDescription`, three arrows). The hand-drawn loop `TargetOutline` (`useTargetRelativeRect`) wraps the stack / row / ligretto deck via the config's `outlineTarget`.
- Side-anchored placements are used only while `useHasRoomBesidePlayground` reports a readable strip beside the playground — below roughly 1400px wide the bubble moves above the cards panel instead (`BottomAnchoredDescription`). The playground step is the exception: on the desktop grid the board almost touches the panel, so its hint goes into the band above the board.
- Below the `md` breakpoint (`useIsNarrowLayout`) the board is a single column — opponents, playground, then the cards panel pinned to the bottom by an onboarding-side `marginTop: auto` wrapper (the shared `MobileGameGrid` knows nothing about onboarding). The player's cards reach `CardsPanel` through its `stack` / `rowCards` / `ligretto` slots; below `sm` the panel reflows into two rows (row on top, decks below) — same as in the real game.
- `pnpm exec playwright test onboarding` walks the flow twice: desktop (`chromium`) and phone (`mobile-chrome`).
- The whole app (onboarding included) works behind authorization: routes render only after `/auth/me` responds.
