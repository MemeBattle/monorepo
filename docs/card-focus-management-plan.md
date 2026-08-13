# Card Focus Management Implementation Plan

## Goal

Replace `game.localPlayerState.selectedCardIndex` with a React Context feature that owns focused-card state and exposes focus operations to card and hotkey integrations.

`CardFocusProvider` owns focus state and clicks outside focusable cards. Card components and `usePanelHotkeys` use one public hook to render and change focus. Existing Redux actions remain the boundary for game commands and backend communication.

## Current state

Focus is currently represented by `game.localPlayerState.selectedCardIndex` and manipulated from several layers:

- `apps/ligretto-frontend/src/ducks/game/slice.ts` declares `SelectedCardIndex` and `setSelectedCardIndexAction`.
- `apps/ligretto-frontend/src/ducks/game/listeners.ts` focuses/unfocuses row and open-stack cards and reads the selected index during playground placement.
- `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx` renders row-card focus and clears it on outside clicks.
- `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx` renders open-stack focus and clears it on outside clicks.
- `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/usePanelHotkeys.ts` maps card hotkeys and clears focus on Escape.

Focus is UI-local state, but its ownership is mixed with persisted game state, per-card outside-click listeners, and a separate hotkey hook.

## Public API

Create `apps/ligretto-frontend/src/features/cardFocus/` as a React Context feature.

Only these symbols are exported from the module:

```ts
export { CardFocusProvider } from './ui/CardFocusProvider'
export { useCardFocus } from './ui/useCardFocus'
```

Context, internal types, event utilities, and tests remain private to the module.

Suggested internal boundary:

```text
features/cardFocus/
├── index.ts
└── ui/
    ├── CardFocusContext.ts
    ├── CardFocusProvider.tsx
    ├── CardFocusProvider.spec.tsx
    └── useCardFocus.ts
```

The hook accepts the focused card location as a discriminated union:

```ts
type CardFocusOptions = { type: 'open-stack' } | { type: 'row'; index: number }
```

The hook and context expose the same discriminated target type. The hook derives a private string key from `type` and optional row `index` for equality and cleanup comparisons. Card identity is supplied separately as the hook dependency list.

Only row cards and the open stack card are focus targets. The closed stack, Ligretto deck, and playground are game interaction targets but are not focusable.

## Provider responsibilities

`CardFocusProvider` is the only owner of focused-card state and outside-card dismissal. Card hotkeys remain in `usePanelHotkeys` inside `CardsPanelContainer`.

The provider:

1. stores the current `CardFocusOptions` target in React state;
2. owns an internal registry of currently rendered focusable-card targets;
3. enables focus only in manual placement mode while the player is in game;
4. installs one document-level listener that clears focus after a click outside a marked focusable card;
5. clears focus when disabled, when the focused target unregisters, or when the provider unmounts.

The provider does not replace Redux game actions or shared payloads. It coordinates UI focus before dispatching the existing actions.

## Hook contract

`useCardFocus` is the only public consumer hook.

For a focusable card, it receives the target and current identity:

```ts
const { isFocused, isDimmed, toggleFocus, clearFocus } = useCardFocus({ type: 'row', index }, [card.color, card.value])
```

It returns:

- `isFocused` for the card's selected style;
- `isDimmed` when another card is focused;
- `toggleFocus()` for pointer interaction;
- `clearFocus()` for the few integration paths that complete a placement;
- the player-card wrapper passes the private `data-card-focus-element` marker directly to `Card`.

For non-card integration code, the same hook may be called without a target:

```ts
const { focusedCard, clearFocus } = useCardFocus()
```

This supports playground placement without exporting the context or a second hook. The hook throws a clear error outside `CardFocusProvider`.

Each targeted hook call registers its rendered card in the provider and unregisters it during cleanup. Generic `toggleFocus(target)` resolves the target through this registry: a missing registration clears focus and a registered target toggles focus. Game actions remain in the card click handlers and other existing command handlers.

## Focus lifecycle

### Selecting and toggling

- Clicking a focusable card in manual placement mode focuses it.
- Clicking the focused card clears focus.
- Clicking another focusable card transfers focus to it.
- The matching row/open-stack hotkey follows the same rules.
- Cards that must play immediately, including value `1`, continue through the existing game-action path without becoming focused.
- Automatic placement mode does not create focus.

### Card identity changes

A focused card is cleared when its rendered card changes.

`useCardFocus({ type, index? }, deps)` derives a key for the card location. Its effect cleanup clears the previous matching key when the key or any caller-provided dependency changes. Consumers pass card color and value as dependencies so a normal re-render with unchanged identity preserves focus.

The hook also clears focus when the focused card component unmounts. This covers row-card replacement, open-stack rotation/update, and removal of the selected card.

### Hotkey handling

`CardsPanelContainer/usePanelHotkeys.ts` remains the keyboard integration boundary and calls focus operations from `useCardFocus`. It does not select card state from Redux; registered card components are the source of truth for whether a focus target currently exists.

- `Q/W/E/R/T`: resolve row indices `0..4`; focus/toggle in manual placement mode or dispatch the existing row-card action when immediate play applies.
- `X`: focus/toggle the open stack card or dispatch its existing immediate-play action.
- Space: clear focus, then dispatch `tapStackDeckCardAction()` exactly once.
- `L`: dispatch `tapLigrettoDeckCardAction()` without introducing a Ligretto focus target.
- Escape: clear focus without dispatching a game command.

`usePanelHotkeys` uses the existing hotkey library and `preventDefault` behavior. Hotkeys are disabled when focus management is disabled. Pointer and keyboard paths call the same focus operations so their focus rules cannot drift.

### Clicking outside cards

Outside-click handling belongs entirely to `CardFocusProvider`; card components do not register individual `onClickOutside` handlers.

Each focusable row or open-stack card root receives the private `data-card-focus-element` marker directly through `Card`'s pass-through data attributes. Closed-stack and Ligretto cards are not marked, so their existing actions run and the completed click also dismisses any stale focus.

While a card is focused, the provider registers one bubbling `click` listener on `document`:

1. normalize `event.target` to an `Element`;
2. call `target.closest('[data-card-focus-element]')`;
3. preserve focus when a marked card contains the target;
4. otherwise clear focus;
5. remove the listener when focus becomes empty or the provider unmounts.

Use a bubbling `click` listener rather than a capture-phase pointer listener. Card interaction handlers run first, and the document listener observes the completed click afterward. This avoids clearing focus before a card can toggle or transfer it. The handler must also tolerate non-`Element` targets and detached nodes.

Expected behavior:

- clicking card content, badges, or nested elements preserves the card interaction;
- clicking another card lets that card transfer/toggle focus;
- clicking empty panel space clears focus;
- clicking the playground background clears focus;
- clicking unrelated UI clears focus;
- one user click causes at most one focus transition;
- provider unmount leaves no document listener behind.

### Explicit clearing outside the provider

Only successful playground placement needs external access to `clearFocus()` and `focusedCard`. It reads both through `useCardFocus()`, dispatches the existing placement action, then clears focus.

All other generic clearing is provider-owned:

- Escape;
- closed-stack rotation by Space;
- outside-card clicks;
- disabling/unmounting the provider;
- card identity change/unmount through the card hook.

Closed-stack pointer rotation can use the card hook's `clearFocus()` before dispatching the existing action. No separate context hook is introduced.

## Migration plan

### Phase 1: Add provider and hook behavior tests

**Create:** `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusProvider.spec.tsx`

1. Verify row and open-stack focus, toggle, and transfer behavior.
2. Verify a re-render with unchanged identity preserves focus.
3. Verify changed `value` or `color` clears focus.
4. Verify unmounting the focused card clears focus.
5. Verify disabled focus management clears and rejects focus updates.
6. Verify clicks on marked card roots and nested card content are not outside clicks.
7. Verify clicks outside focusable cards clear focus.
8. Verify clicking another focusable card transfers focus without an intermediate outside clear.
9. Verify non-`Element` event targets are handled safely.
10. Verify the document listener is active only while focused and removed on clear/unmount.

### Phase 2: Implement the private context, provider, and hook

**Create:**

- `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusContext.ts`
- `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusProvider.tsx`
- `apps/ligretto-frontend/src/features/cardFocus/ui/useCardFocus.ts`
- `apps/ligretto-frontend/src/features/cardFocus/index.ts`

1. Implement provider-local string-key focus state.
2. Implement shared operations used by hotkeys and card pointer callbacks.
3. Implement the bubbling document click listener and cleanup.
4. Implement identity-change and unmount clearing in `useCardFocus`.
5. Return rendering state and focus operations from the hook.
6. Export only `CardFocusProvider` and `useCardFocus` from `index.ts`.
7. Make all provider tests pass.

### Phase 3: Mount the provider

**Modify:** the nearest active-game owner that contains player cards, card hotkeys, and playground consumers.

1. Mount one provider for the active game UI.
2. Pass/derive the enabled state for manual placement and in-game status.
3. Ensure player cards and playground placement are descendants of the same provider.
4. Keep `CardsPanelContainer/usePanelHotkeys.ts` and route focus operations through `useCardFocus`.
5. Do not register a Redux reducer or listener middleware for focus.

### Phase 4: Migrate card components

**Modify:**

- `PlayerRowCardsContainer.tsx`
- `PlayerCardsStack.tsx`
- `PlayerStackOpenCard.tsx` and `PlayerStackDeck.tsx`
- shared `Card` to pass through data attributes

1. Use the hook for each row card and the open stack card.
2. Replace Redux focus selectors with `isFocused`/`isDimmed`.
3. Route manual pointer focus through `toggleFocus()`.
4. Keep existing Redux actions for immediate-play game commands.
5. Mark only focusable row and open-stack `Card` roots; closed-stack and Ligretto cards remain outside-click targets.
6. Remove all per-card outside-click focus handlers.
7. Preserve presentational `isSelected` and `isDarkened` props.

### Phase 5: Migrate placement and rotation integration

**Modify:**

- `PlayerCardsStack.tsx`
- `PlaygroundContainer.tsx` or the placement integration point

1. Clear focus before pointer-driven closed-stack rotation, then dispatch the existing action once.
2. Read `focusedCard` through `useCardFocus()` for manual playground placement.
3. Dispatch the existing row/open-stack placement action.
4. Clear focus after successful action dispatch.
5. Keep backend payloads unchanged.
6. Add hotkey integration tests for Escape dismissal and one-action Space rotation.
7. Add integration tests for pointer-driven stack rotation and both placement sources.

### Phase 6: Remove Redux focus state

**Modify:**

- `apps/ligretto-frontend/src/ducks/game/slice.ts`
- `apps/ligretto-frontend/src/ducks/game/selectors.ts`
- `apps/ligretto-frontend/src/ducks/game/listeners.ts`
- remaining imports found by repository search

1. Remove `SelectedCardIndex`, `game.localPlayerState.selectedCardIndex`, and `setSelectedCardIndexAction`.
2. Remove `selectedCardIndexSelector`.
3. Remove focus transitions from game listeners while preserving game-command dispatches.
4. Require zero production references to the removed API.
5. Run the complete validation suite.

## Testing and validation

From `apps/ligretto-frontend` after every phase:

```bash
pnpm test:ci
pnpm ts-check
```

Before merging, from the repository root:

```bash
pnpm lint:check
pnpm fmt:check
pnpm ts-check
pnpm test:ci
```

Manual acceptance checks:

1. Select, toggle, and transfer row/open-stack focus by click and hotkey.
2. Re-render a focused card unchanged; focus remains.
3. Change or remove a focused card; focus clears.
4. Click card content and nested badges; the click is not treated as outside.
5. Click empty panel space, playground background, and unrelated UI; focus clears.
6. Rotate the stack by click and Space; focus clears and rotation occurs once.
7. Place row and open-stack cards on the playground; the correct existing action is dispatched and focus clears.
8. Press Escape; focus clears without a game command.
9. Verify automatic placement mode and Ligretto deck behavior do not regress.
10. Navigate away from the game and verify no hotkey/document listeners remain.

## Delivery sequence

1. `test(ligretto): characterize card focus provider behavior`
2. `feat(ligretto): add card focus provider`
3. `refactor(ligretto): migrate card focus consumers`
4. `refactor(ligretto): migrate card placement focus`
5. `refactor(ligretto): remove selected card redux state`

## Risks and decisions

- Focus is React Context state, not Redux state.
- Hotkeys remain panel-owned; outside-card dismissal is provider-owned.
- Only the provider and one hook are public.
- A normal re-render preserves focus; changed card identity or unmount clears it.
- Outside detection is document-wide and based on marked focusable card roots, not the panel boundary.
- A bubbling `click` listener avoids capture-phase races with card handlers.
- Card identity cleanup depends on the focus key, `color`, and `value`, not object reference.
- Native DOM keyboard focus is separate; this feature does not call `HTMLElement.focus()`.
- Existing Redux game actions and shared payloads remain unchanged.
