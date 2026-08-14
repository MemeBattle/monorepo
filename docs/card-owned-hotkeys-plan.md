# Card-Owned Hotkeys Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move every hotkey to the narrowest component that owns its behavior, remove provider-side card registration, and keep card focus cleanup lifecycle-driven.

**Architecture:** Add an internal `useCardHotkey` adapter for rendered player controls. Row cards own `Q/W/E/R/T`, the open-stack card owns `X`, the stack deck owns Space, and the Ligretto deck owns `L`; each uses the same callback as its pointer interaction. `CardFocusProvider` owns Escape and outside-click dismissal. Targeted `useCardFocus` consumers expose only focus state and `toggleFocus`; parameterless consumers receive only `focusedCard` and `clearFocus`.

**Tech Stack:** React, TypeScript, `react-hotkeys-hook`, Redux Toolkit, Vitest, React Testing Library.

**Issue:** [#639](https://github.com/MemeBattle/monorepo/issues/639)

---

## Current input flow

```text
Q/W/E/R/T/X/Space/L/Escape
  -> CardsPanelContainer
  -> usePanelHotkeys
  -> focus operation or Redux command

card/deck click
  -> rendered owner component
  -> owner callback
  -> focus toggle or Redux command
```

This central hook can respond for a control that is not rendered and duplicates decisions already made by the component's pointer handler. The focus provider also keeps a card registry solely to validate centrally generated focus targets.

## Target input flow

```text
PlayerRowCard             -> useCardHotkey(Q/W/E/R/T, onActivate, enabled)
PlayerStackOpenCard       -> useCardHotkey(X, onActivate, enabled)
PlayerStackDeck           -> useCardHotkey(Space, onActivate, enabled)
LigrettoDeckContainer     -> useCardHotkey(L, onActivate, enabled)
CardFocusProvider         -> useHotkeys(Escape, clearFocus, enabled)
```

Each rendered owner routes its key through the same callback as its click. If the owner is absent or has no available action, its hook remains unconditionally mounted but disabled and the badge is hidden. In particular, Space remains available for an empty closed stack when an open card can be reshuffled, while `L` is unavailable for an empty Ligretto deck. Disabled controls expose neither handler nor badge. `usePanelHotkeys` is removed.

---

## Hook contracts and component usage

### Internal card/control hotkey hook

**Create:** `apps/ligretto-frontend/src/features/player/lib/useCardHotkey.ts`

```ts
export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void, enabled: boolean) => {
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      onActivate()
    },
    { enabled: enabled && !!hotkey },
  )
}
```

The hook is internal to the player feature. It is not part of `#features/cardFocus` and is not exported as a public player API.

### Row-card usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`

```ts
const { isFocused, isDimmed, toggleFocus } = useCardFocus(
  { type: 'row', index },
  [card.color, card.value],
)

const onCardActivate = () => {
  if (isDndEnabled && card.value !== 1) {
    toggleFocus()
    return
  }

  dispatch(tapCardAction({ cardIndex: index }))
}

useCardHotkey(hotkey, onCardActivate, isDndEnabled)

return <Card onClick={onCardActivate} /* existing props */ />
```

The existing index mapping remains `Q/W/E/R/T`. Card activation never calls `clearFocus`; a changed/unmounted card is cleared by the targeted `useCardFocus` lifecycle cleanup.

### Open-stack usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`

```ts
const { isFocused, isDimmed, toggleFocus } = useCardFocus(
  { type: 'open-stack' },
  [card.color, card.value],
)

const onCardActivate = () => {
  if (isDndEnabled && card.value !== 1) {
    toggleFocus()
    return
  }

  dispatch(tapStackOpenDeckCardAction())
}

useCardHotkey(Hotkey.x, onCardActivate, isDndEnabled)

return <Card onClick={onCardActivate} /* existing props */ />
```

The component only mounts when an open card exists. It never clears focus manually.

### Stack-deck usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackDeck.tsx`

```ts
const { clearFocus } = useCardFocus()
const onStackDeckActivate = () => {
  clearFocus()
  dispatch(tapStackDeckCardAction())
}

const stackActionAvailable = stackDeckCards.length > 0 || !!stackOpenDeckCard
useCardHotkey(Hotkey.space, onStackDeckActivate, isDndEnabled && stackActionAvailable)

return <Card onClick={onStackDeckActivate} /* existing props */ />
```

Pass the active-game/manual-controls and action-availability enablement needed by the component from `PlayerCardsStack`. An empty closed stack remains actionable when an open card exists because Space triggers reshuffle; when both are empty, the hook is disabled and the badge is hidden. Space is removed from panel-level handling. The shared pointer/keyboard callback explicitly clears stale card focus before dispatching the stack action exactly once.

### Ligretto-deck usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/LigrettoDeckContainer.tsx`

```ts
const onLigrettoDeckActivate = useCallback(() => {
  dispatch(tapLigrettoDeckCardAction())
}, [dispatch])

useCardHotkey(Hotkey.l, onLigrettoDeckActivate, isDndEnabled && ligrettoDeckCards.length > 0)

return <LigrettoPack onLigrettoDeckCardClick={onLigrettoDeckActivate} /* existing props */ />
```

`L` is registered only while the Ligretto deck owner is mounted, controls are enabled, and the deck is non-empty.

### Provider-owned Escape

**Modify:** `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusProvider.tsx`

```ts
useHotkeys(
  Hotkey.escape,
  event => {
    event.preventDefault()
    clearFocus()
  },
  { enabled },
)
```

Escape is a focus-level command, so it belongs to `CardFocusProvider` alongside outside-click and enabled-state cleanup.

---

## Focus API simplification

Card-owned hotkeys make target validation through a provider registry unnecessary.

### Remove registration from context and provider

**Modify:**

- `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusContext.ts`
- `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusProvider.tsx`

Remove:

- the provider's `registrations` set;
- `registerCard` from `CardFocusContextValue`;
- registration checks from `toggleFocus`;
- registry cleanup logic.

`toggleFocus(target)` only applies the enabled guard and semantic target toggle. A target can only be produced by a mounted owner or playground integration after the card-specific global cases are removed.

### Narrow targeted `useCardFocus`

**Modify:** `apps/ligretto-frontend/src/features/cardFocus/ui/useCardFocus.ts`

The targeted overload becomes:

```ts
export function useCardFocus(
  target: CardFocusOptions,
  deps: DependencyList,
): {
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
}
```

Remove `clearFocus` only from the targeted/card return value. Keep `clearFocus` in the parameterless integration overload for provider-level consumers such as playground behavior where explicit dismissal is still required.

Replace registration lifecycle with target-aware cleanup inside the hook/context implementation. On target identity dependency change or unmount, clear focus only if that exact target is still focused. This preserves cleanup without exposing manual clearing to card components and avoids a stale cleanup clearing focus transferred to another target.

---

## Remove the panel hotkey layer

**Delete:** `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/usePanelHotkeys.ts`

**Modify:** `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/CardsPanelContainer.tsx`

Remove the `usePanelHotkeys` import and invocation. `CardsPanelContainer` continues to render player controls and calculate active-game state, but no longer owns keyboard commands.

---

## Implementation tasks

### Task 1: Add the internal owner hotkey hook with TDD

**Files:**

- Create: `apps/ligretto-frontend/src/features/player/lib/useCardHotkey.ts`
- Create: `apps/ligretto-frontend/src/features/player/lib/useCardHotkey.spec.tsx`

**Steps:**

1. Write failing tests proving an enabled key invokes the owner callback and prevents default.
2. Cover disabled and undefined-key states.
3. Implement the minimal wrapper.
4. Run the targeted spec and confirm GREEN.

### Task 2: Simplify focus context and targeted hook

**Files:**

- Modify: `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusContext.ts`
- Modify: `apps/ligretto-frontend/src/features/cardFocus/ui/CardFocusProvider.tsx`
- Modify: `apps/ligretto-frontend/src/features/cardFocus/ui/useCardFocus.ts`
- Modify: `apps/ligretto-frontend/src/features/cardFocus/index.spec.tsx`

**Steps:**

1. Write failing lifecycle tests for identity change, unmount, and transferred focus.
2. Remove `registerCard` and the provider registry.
3. Remove `clearFocus` from the targeted overload only.
4. Implement target-aware lifecycle cleanup.
5. Keep the parameterless integration overload's explicit `clearFocus`.
6. Add provider-owned Escape coverage.

### Task 3: Move row and open-stack keys to their cards

**Files:**

- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`
- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`
- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx`
- Add focused integration specs near these components.

**Steps:**

1. Cover normal cards, value-1 cards, missing cards, and disabled mode.
2. Use one `onCardActivate` callback for click and hotkey.
3. Remove all manual card `clearFocus` calls.
4. Ensure the `X` badge is hidden when the open card is absent.

### Task 4: Move deck keys to deck owners

**Files:**

- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackDeck.tsx`
- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx`
- Modify: `apps/ligretto-frontend/src/features/player/ui/LigrettoDeckContainer.tsx`
- Add focused integration specs for Space and `L`.

**Steps:**

1. Route Space through the stack deck's existing click command only when the closed stack has cards or an open card can be reshuffled.
2. Route `L` through the Ligretto deck's existing click command only when the deck is non-empty.
3. Verify absent/unmounted controls do not respond.
4. Verify each key dispatches its Redux command exactly once.
5. Verify both Space and pointer stack activation clear focus before dispatching.

### Task 5: Delete panel hotkeys and update documentation

**Files:**

- Delete: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/usePanelHotkeys.ts`
- Modify: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/CardsPanelContainer.tsx`
- Modify: `docs/card-focus-management-plan.md`

Document component-owned keys, provider-owned Escape, registry removal, and lifecycle-only card cleanup.

---

## Components and hooks affected

| Component/module             | Planned change                              | Hook usage after implementation                                                      |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `PlayerRowCard`              | Own `Q/W/E/R/T`; no manual focus clear      | `useCardFocus(target, deps)` + `useCardHotkey(hotkey, onCardActivate, enabled)`      |
| `PlayerStackOpenCard`        | Own `X`; no manual focus clear              | `useCardFocus(openStack, deps)` + `useCardHotkey(Hotkey.x, onCardActivate, enabled)` |
| `PlayerStackDeck`            | Own Space; shared click/key clear + command | `useCardFocus()` + `useCardHotkey(Hotkey.space, onStackDeckActivate, enabled)`       |
| `LigrettoDeckContainer`      | Own `L` and share command with click        | `useCardHotkey(Hotkey.l, onLigrettoDeckActivate, enabled)`                           |
| `CardFocusProvider`          | Own Escape; remove registry                 | `useHotkeys(Hotkey.escape, clearFocus, { enabled })`                                 |
| targeted `useCardFocus`      | Lifecycle cleanup; no returned `clearFocus` | `{ isFocused, isDimmed, toggleFocus }`                                               |
| parameterless `useCardFocus` | Keep integration dismissal API              | `{ focusedCard, clearFocus }`                                                        |
| `CardsPanelContainer`        | Stop owning hotkeys                         | No `usePanelHotkeys` call                                                            |
| `usePanelHotkeys`            | Remove                                      | Deleted                                                                              |
| `PlaygroundContainer`        | No behavioral change                        | Existing parameterless `useCardFocus()` usage remains                                |

## Validation

```bash
# repo root
./node_modules/.bin/oxfmt --check \
  docs/card-focus-management-plan.md \
  apps/ligretto-frontend/src/features/cardFocus \
  apps/ligretto-frontend/src/features/player
./node_modules/.bin/oxlint apps/ligretto-frontend/src
git diff --check

# apps/ligretto-frontend
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
```

## Non-goals

- No Redux state or game-action changes.
- No new focus targets.
- No generic activation callback registry in focus context.
- No playground placement changes.
- No hotkey or badge for an unavailable owner action (empty stack plus empty open deck, empty Ligretto deck, or disabled controls).

## Risks and mitigations

- **Stale cleanup clears another card:** make lifecycle cleanup target-aware and test focus transfer before unmount.
- **Duplicate handlers during migration:** delete each key from `usePanelHotkeys` when its owner hook is added, then delete the panel hook.
- **Conditional hooks:** mount hooks unconditionally inside owner components and use the `enabled` option.
- **Badge mismatch:** show key badges only when their owner/action is available.
- **Immediate-play regression:** explicitly test value `1` for pointer and keyboard activation.
