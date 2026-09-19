# Code review — `docs/issue-685-drag-drop-plan`

Scope: `master...HEAD` (21 commits, ~2.3k added lines) plus the uncommitted working-tree change.

Verification run: `pnpm ts-check` (clean), `pnpm fmt:check` (clean), `pnpm lint:check` (fails, see #1),
frontend / gameplay-backend / shared test suites (green at review time).

## Findings

### 1. Unrelated uncommitted edit breaks lint — `apps/ligretto-core-backend/database/schema.ts:8`

The `import type` → value import change is unrelated to this branch and makes `pnpm lint:check` fail with
oxlint `typescript(consistent-type-imports)`, so CI lint will go red. The file is auto-generated, so the edit
is also lost on the next `node ace migration:run`.

**Plan.** Revert the file (`git checkout -- apps/ligretto-core-backend/database/schema.ts`). If the value
import is actually needed, fix it at the generator/template level and land it as a separate commit.

### 2. Drop side ignores the injectable card selector — `apps/ligretto-frontend/src/features/cardInteraction/ui/useDroppableTarget.ts:16`

`useDroppableTarget` resolves the source card through the hard-coded `cardByInteractionTarget` instead of the
provider's injectable `cardByTargetSelector`. Onboarding passes `cardByOnboardingTarget`, which is therefore
honoured on the drag side but ignored on the drop side: the first non-gameplay provider that renders
`useDroppableTarget` / `PlaygroundDeck` gets `isValid === false` permanently.
`apps/ligretto-frontend/src/features/player/ui/PlayerCardDragOverlay.tsx:11` has the same hard-coding.

**Plan — delete the injection point instead of fixing it.** `cardInteraction` should own only what is
independent of card values; everything that reads card values moves to the consumer that already owns them.

1. Drop `cardByTargetSelector` from `CardInteractionContextValue` and from `CardInteractionProviderProps`.
2. Make `useCardDragTarget` return the whole `CardDragData` (`{ target, card }`) instead of just the target —
   the dragged card is already carried in the draggable's data, so no selector is needed to render the drag
   overlay. `PlayerCardDragOverlay` then renders `dragged.card` directly, and onboarding can render the same
   overlay with no gameplay store access.
3. Move `isValid` out of `useDroppableTarget`: the hook returns `{ id, isOver, setNodeRef }` plus the current
   drag/active target, and the caller decides validity. `PlaygroundDeck` keeps the `canPlaceCardOnDeck` call
   against `playgroundDecksSelector`; onboarding computes its own from `onboardingGameSelector`.
4. Move `cardByInteractionTarget` out of the feature into the gameplay layer (`#features/playground` or
   `#ducks/game`); `cardByOnboardingTarget` stays in `pages/onboarding`. Export neither from
   `#features/cardInteraction`.
5. `useCardInteraction`'s "clear focus when the card identity changes" effect also depends on the selector.
   Keep the effect inside the hook and feed it the card instead: `useCardInteraction(target, card)`, with the
   overload becoming `(target: CardInteractionTarget, card?: Card)`. Both call sites already hold the card as
   a prop (`PlayerRowCard`, `PlayerStackOpenCard`), so the `useSelector` call disappears from the hook while
   the cleanup stays encapsulated — the effect keeps depending on `targetKey`, `card?.color`, `card?.value`
   exactly as today. The no-target overload is unchanged.

After this the feature's public surface is targets, focus state, drag/drop wiring and hotkeys — no card
values, no store selectors.

### 3. No keyboard way to deselect a card — `apps/ligretto-frontend/src/features/cardInteraction/ui/useCardHotkey.ts:12`

The unconditional `clearActiveTarget()` before `onActivate()` turns a repeated card hotkey into a re-select
instead of a toggle-off. Combined with the removed Escape handler (`Hotkey.escape` in `ducks/game/utils.ts:25`
is now dead code) there is no keyboard path to clearing a selection at all. `master` had both.

**Plan.**

1. Add an Escape handler to `CardInteractionProvider`, next to the existing outside-click effect: in the same
   `state.mode === 'focused'` effect register a `document` `keydown` listener that calls `preventDefault()` and
   dispatches `{ type: 'clear' }`. Scoping it to `focused` keeps it out of the way of a drag in progress.
2. Remove the unconditional `clearActiveTarget()` from `useCardHotkey` so the hotkey just calls `onActivate()`
   and the provider's `toggle` reducer branch gives back toggle-off on a repeat press. The hotkeys that
   genuinely need to clear first (Space / stack commands) should call `clearActiveTarget()` themselves in their
   own `onActivate`.
3. Either wire `Hotkey.escape` into the provider's handler or delete it from `ducks/game/utils.ts`.

### 4. Activation timing changed for every card — `apps/ligretto-frontend/src/entities/card/ui/Card/Card.tsx:162`

`onMouseDown={onClick}` → `onClick={onClick}` affects all cards, including non-draggable stack / Ligretto /
onboarding cards. This reverts the deliberate speed-game behaviour introduced in LIG-144, and the feature
README added in this branch flags it as unresolved.

The reason for the change is a collision, not a design decision: `PlayerRowCardsContainer` and
`PlayerStackOpenCard` spread dnd-kit's `{...listeners}` (which contains `onMouseDown`) into `Card`, and
`Card`'s own `onMouseDown={onClick}` came after `{...rest}`, so it silently overwrote the drag listener.

**Plan.** Compose the two handlers instead of choosing one.

1. In `Card`, bind activation back to mousedown but chain it with the incoming listener rather than replacing
   it: `onMouseDown={event => { rest.onMouseDown?.(event); onClick?.(event) }}`. Same for `onTouchStart` if a
   touch activation path is needed.
2. No guard against "activate then drag" is required: `MouseSensor` has `activationConstraint.distance: 6`, so
   a press without movement never becomes a drag, and when a drag does start the reducer's `dragStart` branch
   overwrites the focus state with the same target and `dragTerminal` returns it to `idle`.
3. Regression-check the touch path (commit 7048d9b6, cancelled touch compatibility clicks) and the onboarding
   e2e, which now asserts `data-card-active` after a click.

### 5. Catalog hygiene — `pnpm-workspace.yaml:66`

Stray blank line inside the `catalog:` block, and `@dnd-kit/core` inserted out of alphabetical order at line 43.

**Plan.** Delete the blank line, move `@dnd-kit/core` after `@adonisjs/*` / into its alphabetical slot.

### 6. Valid-drop highlighting leaks information in the real game — `apps/ligretto-frontend/src/features/playground/ui/PlaygroundDeck/PlaygroundDeck.tsx:67`

Every playground deck that accepts the dragged card lights up green as soon as a drag starts. Ligretto is a
speed game: telling the player which of the 12 piles accept the card removes exactly the scanning the game is
about. The onboarding is the opposite case — there the hint is the point.

**Plan.**

1. In `PlaygroundDeck` (gameplay), drop the `isValid` branch of `boxShadow` and the `data-drop-valid`
   attribute; keep only the `isOver` feedback, which is pointer position, not game knowledge.
2. Keep the highlight in `OnboardingPlayground`, computed locally (see #2.3) from the onboarding store.
3. Suppress it there when the dragged card's `value === 1`: a 1 is placeable on every empty deck, so the hint
   would light up most of the table and teach nothing. Highlight only decks with a matching top card.

### 7. The card flashes back to its origin after a drop — provider drag lifecycle + `PlaygroundDeck.onDrop`

On a successful drop the overlay disappears immediately (`DragOverlay dropAnimation={null}`), the source card
re-renders at full opacity in its original slot, and only then — after the socket round-trip and
`updateGameAction` — does it vanish from the row and appear on the deck. The result is a visible flash of the
card returning home before the move is applied.

**Plan — pick one, in order of cost.**

1. _Pending-placement state (cheap, targeted)._ Keep the dragged target in the provider after `onDragEnd`
   instead of going straight to `idle`: add a `{ mode: 'placing'; target }` state that the source card reads to
   stay at `opacity: 0`. Clear it when the card identity at that target changes (the server applied the move)
   or on a short timeout / the next `updateGameAction` (the move was rejected). No duplicated game state, and
   the failure mode is a card that reappears slightly late.
2. _Optimistic update (correct, more work)._ Apply the move locally in the game slice on dispatch — remove the
   card from the row / open stack, push it onto the target deck — and let the authoritative `updateGameAction`
   reconcile. The backend already validates the move, so a rejected placement simply snaps back on the next
   state push. This also removes the perceived latency of the whole placement, not just the flash.

Recommendation: ship (1) now, and treat (2) as the follow-up, since it is the only one that also fixes the
click-to-place path, which has the same delay without the flash.

## Checked and fine

- `checkIsDeckAvailable` rejects non-integer / out-of-range indices, so old clients that omit
  `playgroundDeckIndex` degrade to a safe no-op inside the existing `try/catch`.
- `canPlaceCardOnDeck`'s `null` vs `undefined` distinction matches the previous inline logic, and the 12-deck
  frontend grid matches `maxCardsOnTable: 12`.
- `PlayerStackDeck`'s new `isHidden={hasCards}` is equivalent to the old `isStackDeckHidden && length > 0`
  given `player.service.ts:81`.
- The open-stack card uses `last(cards)` consistently in both the selector and `cardByInteractionTarget`.
- No stale references remain to the removed `cardFocus`, `PlaygroundContainer`, `tapCardAction`,
  `tapStackOpenDeckCardAction` or the deleted plan docs.

## Pre-existing, not caused by this branch

`apps/ligretto-core-backend` has 10 failing tests (users / CAS mocks). They fail with this branch's changes
stashed as well, so they are unrelated to this work.
