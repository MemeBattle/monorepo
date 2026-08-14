# Remove `dndEnabled` and Legacy Auto-Placement Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make select-then-place the only gameplay mode, remove the `dndEnabled` configuration and all mode branching, while preserving automatic placement for cards with value `1`.

**Architecture:** Normal row/open-stack cards always toggle card focus and are placed only after the player chooses a playground deck. A value-1 card remains the sole exception: activating it dispatches the existing immediate command without a deck index, and the backend chooses an available empty deck. Onboarding adopts the same interaction contract by reusing card focus for normal cards and keeping its first value-1 card as a one-click move.

**Tech Stack:** TypeScript, React, Redux Toolkit, `CardFocusProvider`, Socket.IO actions, Vitest, Playwright.

**Issue:** [#635](https://github.com/MemeBattle/monorepo/issues/635)

---

## Required behavior

### Normal cards (`value !== 1`)

```text
card click or card hotkey
  -> toggle focused card
  -> player clicks a playground deck
  -> send put command with explicit playgroundDeckIndex
  -> backend validates that exact destination
```

Normal cards must never be auto-routed by the frontend or backend.

### Value-1 cards

```text
value-1 card click or card hotkey
  -> send immediate put command without playgroundDeckIndex
  -> backend verifies that the card is value 1
  -> backend chooses the first available empty playground deck
```

This is the only retained automatic placement path. The UI must not focus a value-1 card or require a second click.

### Onboarding

```text
first value-1 row card
  -> one click -> immediate scripted placement

normal row/open-stack card
  -> first click selects the card
  -> second click on the valid playground deck completes the scripted move
```

Ligretto-to-row and stack-flip interactions are not playground placement and remain direct actions.

---

## Current logic that can be deleted

### Shared and backend configuration

| Delete                                  | Path                                                                                                  | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Game.config.dndEnabled`                | `packages/ligretto-shared/src/types.ts`                                                               | The wire/domain model no longer advertises two modes.                         |
| `dndEnabled: false` default             | `apps/ligretto-gameplay-backend/src/entities/game/game.service.ts`                                    | New games have no placement-mode default.                                     |
| Snapshot fields containing `dndEnabled` | `apps/ligretto-gameplay-backend/src/controllers/__tests__/__snapshots__/games-contoller.spec.ts.snap` | Backend snapshots match the simplified config.                                |
| `{ dndEnabled: true }` room payload     | `apps/ligretto-frontend/src/features/create-room/ui/CreateRoomContainer.tsx`                          | Room creation sends only the room name unless another config field is needed. |

`dto.CreateGame.config` remains because other game configuration fields still exist.

### Frontend state and selectors

Delete:

- `dndEnabled` from `apps/ligretto-frontend/src/ducks/game/slice.ts` initial state;
- `isDndEnabledSelector` from `apps/ligretto-frontend/src/ducks/game/selectors.ts` and its barrel export if explicitly exported;
- every selector input/output that exists only to carry `isDndEnabled`;
- all test fixtures and mocks that set or override `dndEnabled`.

Do not replace the removed flag with a constant `true`; remove the branch and represent the always-on behavior directly.

### Frontend component branching and props

Delete the following mode-only plumbing:

- `isDndEnabled` from `PlayerRowCard` props and `PlayerRowCardsContainerSelector`;
- `isDndEnabled` from `PlayerStackOpenCard` props;
- `isDndEnabled` from `playerCardsStackSelector` and `PlayerCardsStack`;
- `isDndEnabled` from `LigrettoPackProps`;
- `isDndEnabledSelector` reads in `LigrettoDeckContainer`;
- `isDndEnabled` from `GameContainer` selector/result;
- the `!isDndEnabled` guard in `PlaygroundContainer`;
- badge/hotkey conditions whose only purpose is hiding controls when DnD mode is off.

Replace mode-based enablement with real availability:

- row key: enabled because the row card component is mounted;
- `X`: enabled because an open-stack card is mounted;
- Space: enabled when the stack can flip or reshuffle;
- `L`: enabled while the Ligretto deck contains cards;
- focus provider: enabled for a non-spectator during `GameStatus.InGame`.

### Legacy generic auto-placement behavior

The backend currently treats a missing `playgroundDeckIndex` as “find any available deck” for every card. Remove that generic fallback.

Keep automatic deck lookup only when the authoritative card value is `1`:

```ts
if (deckPosition === undefined && card.value !== 1) {
  return
}

const finalDeckPosition =
  deckPosition === undefined
    ? await playgroundService.findAvailableDeckIndex(gameId, card)
    : await playgroundService.checkExplicitDeck(gameId, card, deckPosition)
```

Apply the same rule to row cards and stack-open cards. This server-side guard prevents an old or malicious client from auto-placing a normal card by omitting the destination.

The following pieces remain because value `1` still needs them:

- optional `playgroundDeckIndex` in `PutCard` and `PutCardFromStackOpenDeck` DTOs, documented as value-1-only omission;
- `findAvailableDeckIndex` for choosing an empty deck for value `1`;
- `tapCardAction` / `tapStackOpenDeckCardAction` and their listeners, narrowed to the immediate value-1 command path;
- normal shared `putCardAction` / `putCardFromStackOpenDeck` commands with explicit destination from `PlaygroundContainer`.

---

## Production frontend changes

### Row cards

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`

```ts
const onCardActivate = () => {
  if (card.value !== 1) {
    toggleFocus()
    return
  }

  dispatch(tapCardAction({ cardIndex: index }))
}

useCardHotkey(hotkey, onCardActivate, true)
```

Prefer simplifying `useCardHotkey` if all mounted card owners are always enabled, but retain an availability parameter if stack/Ligretto owners still need it. Hotkey badges are shown whenever their card owner is available.

### Open-stack card

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`

```ts
const onCardActivate = () => {
  if (card.value !== 1) {
    toggleFocus()
    return
  }

  dispatch(tapStackOpenDeckCardAction())
}
```

The component owns `X`; no mode prop remains.

### Playground placement

**Modify:** `apps/ligretto-frontend/src/features/playground/ui/PlaygroundContainer.tsx`

- remove `isDndEnabledSelector` from the selector;
- return early only when no card is focused;
- keep structured dispatch:
  - row target -> `putCardAction({ cardIndex, gameId, playgroundDeckIndex })`;
  - open-stack target -> `putCardFromStackOpenDeck({ gameId, playgroundDeckIndex })`.

### Provider boundary

**Modify:** `apps/ligretto-frontend/src/widgets/game/ui/GameContainer.tsx`

```tsx
<CardFocusProvider enabled={!isPlayerSpectator && gameStatus === GameStatus.InGame}>
```

No placement-mode state participates in focus availability.

### Stack and Ligretto controls

**Modify:**

- `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.selector.ts`
- `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx`
- `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`
- `apps/ligretto-frontend/src/features/player/ui/LigrettoDeckContainer.tsx`
- `apps/ligretto-frontend/src/features/player/ui/LigrettoPack/LigrettoPack.tsx`

Use deck/card presence instead of `isDndEnabled` for handlers and badges. `LigrettoPack` becomes purely presentational and no longer knows about game mode.

---

## Backend command hardening

**Modify:**

- `packages/ligretto-shared/src/dto.ts`
- `apps/ligretto-gameplay-backend/src/gameplay/gameplay.ts`
- `apps/ligretto-gameplay-backend/src/entities/playground/playground.service.ts`
- corresponding gameplay/playground unit specs (create them if absent)

### Explicit destination path

When `playgroundDeckIndex` is supplied, validate exactly that deck. Do not silently fall back to another deck if the requested destination is invalid.

### Value-1 automatic path

When `playgroundDeckIndex` is omitted:

1. load the authoritative row/open-stack card;
2. reject unless `card.value === 1`;
3. find the first available empty deck;
4. place and remove the card only after destination validation succeeds.

### Required backend tests

Cover both row and stack-open commands:

- value `1` + no index -> automatically placed on an empty deck;
- normal card + no index -> rejected and player card remains;
- normal card + valid explicit index -> placed there;
- normal card + invalid explicit index -> rejected without fallback;
- value `1` + explicit valid index -> accepted if game rules allow it;
- no available empty deck for value `1` -> no mutation.

---

## Onboarding redesign

The onboarding currently dispatches `Put*` events directly from row/open-stack clicks and gives `Playground` a no-op click handler. It must teach the real two-stage interaction.

### Provider and focus ownership

**Modify:** `apps/ligretto-frontend/src/pages/onboarding/OnboardingPage.tsx`

Wrap the interactive onboarding game tree in its own enabled `CardFocusProvider`. The production `GameContainer` provider does not cover the onboarding route.

Use the same targets as gameplay:

- `{ type: 'row', index }` for row cards;
- `{ type: 'open-stack' }` for the visible stack card.

Add `data-card-focus-element` to onboarding card interaction roots so clicking a card is not treated as outside dismissal.

### Onboarding row cards

**Modify:** `apps/ligretto-frontend/src/pages/onboarding/PlayerRowCards.tsx`

For each rendered row card:

- value `1`: dispatch its existing onboarding placement action immediately;
- value other than `1`: call targeted `useCardFocus(...).toggleFocus()`;
- preserve allowed-event gating so cards outside the current scripted move cannot be selected;
- render `isSelected`/dimming consistently with production cards.

The first blue `1` in `OnboardingStep.FirstCard` remains a one-click automatic placement and demonstrates the explicit exception.

### Onboarding open-stack card

**Modify:** `apps/ligretto-frontend/src/pages/onboarding/OnboardingPage.tsx` or extract a dedicated onboarding open-stack card component.

- the face-down stack still flips directly on click;
- a playable open-stack card toggles `{ type: 'open-stack' }` instead of dispatching `putStackCardAction()` immediately;
- if an onboarding stack-open card ever has value `1`, preserve the one-click automatic path.

### Onboarding playground routing

Replace `onDeckClick={() => null}` with a handler that reads `focusedCard` and current allowed events.

For a valid focused target and valid scripted destination:

- open-stack -> dispatch `putStackCardAction()`;
- row index `1` -> dispatch `putSecondCardAction()`;
- row index `2` -> dispatch `putThirdCardAction()`;
- row index `0` remains the immediate value-1 path in the current script.

Reject a wrong playground deck without advancing the FSM. Derive/encode the expected destination for each allowed scripted event so the user must click the deck the card can legally extend. The existing FSM transition can continue mutating the known scripted deck after the UI has validated the clicked index.

Do not manually clear card focus after dispatch. The transition changes/removes the card identity, and targeted `useCardFocus` lifecycle cleanup clears the old target.

### FSM and script impact

**Review/modify:**

- `apps/ligretto-frontend/src/features/onboarding/model/fsm.ts`
- `apps/ligretto-frontend/src/features/onboarding/model/listeners.ts`
- `apps/ligretto-frontend/src/features/onboarding/model/script.ts`
- `apps/ligretto-frontend/src/features/onboarding/model/steps.ts`
- `apps/ligretto-frontend/src/features/onboarding/model/fsm.spec.ts`
- `apps/ligretto-frontend/src/pages/onboarding/snapshots.ts`

Selection is transient UI state and should not become an FSM transition. Existing `PutFirstCard`, `PutSecondCard`, `PutThirdCard`, and `PutStackCard` events continue to mean “placement completed.” Therefore the canonical event script can remain stable unless a new explanatory step is intentionally added.

Update comments and guards that describe direct card-click placement. Keep mutations in the FSM; the page only validates the selected source and clicked destination before dispatching an existing event.

### Onboarding instructions and hints

**Modify:** `apps/ligretto-frontend/src/pages/onboarding/stepConfig.ts`

Explicitly teach both phases:

- `FirstCard`: explain that a `1` is placed automatically in one click;
- `StackAvailableCard`: “select the card, then click the highlighted/valid deck”;
- `RowAvailableCard`: same two-stage instruction;
- `OpponentTurnSecondCard`: select the green `3`, then click the opponent's green pile;
- free-play steps should keep the playground available after selection.

If one bubble cannot clearly point to both source and destination, add a selection-aware hint/description state in the page presentation layer rather than adding game-state transitions.

### Onboarding E2E

**Modify:**

- `apps/ligretto-frontend/e2e/tests/onboarding.spec.ts`
- `apps/ligretto-frontend/src/pages/onboarding/OnboardingPage.page-object.ts`

Add `getPlaygroundDeck(index)` to the page object. Replace the one-control-per-event helper for normal placement events with a performer that:

1. clicks the row/open-stack source;
2. asserts it is selected;
3. clicks the expected playground deck;
4. asserts the FSM advances.

Keep `PutFirstCard` as one click and assert it advances without a selected intermediate state.

Add negative E2E coverage:

- selecting a normal card alone does not advance the step;
- clicking the wrong deck does not advance;
- clicking the valid deck completes placement;
- the value-1 card advances immediately.

---

## TDD implementation sequence

### Task 1: Lock the server invariant

1. Write failing backend tests for omitted-index normal cards and value-1 cards.
2. Narrow automatic lookup to value `1`.
3. Verify explicit destinations never fall back.
4. Run gameplay backend unit tests.

### Task 2: Remove the shared/config flag

1. Remove `dndEnabled` from shared `Game.config`.
2. Remove backend and frontend defaults/payloads.
3. Remove `isDndEnabledSelector`.
4. Let TypeScript identify remaining consumers.
5. Update backend snapshots.

### Task 3: Simplify production frontend owners

1. Update row/open-stack tests first.
2. Remove mode props and selectors.
3. Preserve the `card.value === 1` immediate branch.
4. Make normal cards always toggle focus.
5. Simplify deck hotkey/badge availability.

### Task 4: Simplify playground/provider integration

1. Add/adjust tests proving a focused normal card dispatches with an explicit deck index.
2. Remove the playground mode guard.
3. Enable focus based only on active game and spectator status.
4. Verify value-1 activation never creates focus.

### Task 5: Convert onboarding to select-then-place

1. Add component tests for immediate `1`, normal selection, wrong deck, and valid deck.
2. Add the onboarding provider and focus targets.
3. Route playground clicks to existing completion events.
4. Update descriptions and hints.
5. Update Playwright helpers and canonical flow.

### Task 6: Remove dead tests/docs and run repository validation

1. Delete all remaining `dndEnabled`/`isDndEnabled` fixtures and mocks.
2. Replace disabled-mode tests with owner availability/game-lifecycle tests.
3. Update `docs/card-focus-management-plan.md` and `docs/card-owned-hotkeys-plan.md` where they describe the removed mode.
4. Confirm repository source contains no `dndEnabled` or `isDndEnabled` references (generated `dist/` artifacts are rebuilt, not hand-edited).

---

## Expected deletion/simplification map

| Area               | Removed logic                                    | Retained logic                                                   |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------- |
| Shared config      | `dndEnabled` field                               | Other room/game config fields                                    |
| Room creation      | forced `{ dndEnabled: true }`                    | room name and future unrelated config                            |
| Frontend selectors | `isDndEnabledSelector` and derived plumbing      | card/deck/status selectors                                       |
| Card owners        | mode props and false-mode branches               | normal focus toggle; value-1 immediate action                    |
| Playground         | `!isDndEnabled` guard                            | focused target -> explicit destination command                   |
| Provider           | DnD flag in `enabled` expression                 | in-game/non-spectator lifecycle                                  |
| Backend placement  | missing-index fallback for values `2..10`        | missing-index auto lookup for value `1` only                     |
| Onboarding         | direct placement of normal cards from card click | direct value-1 placement, stack flip, Ligretto-to-row            |
| Tests              | disabled-mode mocks/cases                        | availability, lifecycle, manual placement, and value-1 exception |

---

## Validation

```bash
# Repository-wide absence check (exclude generated output)
rg 'dndEnabled|isDndEnabled' \
  packages apps \
  --glob '!**/dist/**'
# Expected: no matches

# Root quality gates
pnpm fmt:check
pnpm lint:check
pnpm ts-check
pnpm test:ci

git diff --check

# Frontend
cd apps/ligretto-frontend
pnpm test:ci
pnpm ts-check
node_modules/.bin/vite build
pnpm e2e:start -- e2e/tests/onboarding.spec.ts

# Gameplay backend
cd ../ligretto-gameplay-backend
pnpm test:ci
pnpm ts-check
```

Also verify manually:

1. click/hotkey a value-1 row card -> it appears on an empty deck immediately;
2. click/hotkey a normal row card -> it focuses but does not move;
3. click a valid playground deck -> the focused normal card moves there;
4. repeat for open-stack cards;
5. onboarding first `1` moves in one click;
6. onboarding normal row/open-stack moves require source selection and destination click.

## Non-goals

- No change to Ligretto game sequence rules.
- No drag gesture implementation; “DnD” here means the existing select-then-click placement flow.
- No removal of automatic value-1 placement.
- No replacement of Redux/socket command architecture.
- No runtime implementation in this plan-only PR.

## Risks

- **Accidentally removing the value-1 exception:** protect it with frontend and backend tests before deleting mode branches.
- **Leaving a generic backend fallback:** reject omitted destination for values `2..10` server-side.
- **Onboarding teaches obsolete behavior:** require two interactions for every normal playground placement in E2E.
- **Wrong onboarding destination advances the FSM:** validate the clicked deck before dispatching the existing completion event.
- **Hotkeys become unintentionally disabled:** derive availability from mounted owners/deck presence, not from a replacement global flag.
- **Stale docs/tests reintroduce the concept:** enforce a repository search with generated output excluded.
