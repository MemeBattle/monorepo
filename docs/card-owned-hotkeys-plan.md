# Card-Owned Hotkeys Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move `Q/W/E/R/T` and `X` hotkey ownership from the panel-level hook to the rendered row/open-stack card components so keyboard and pointer activation share one handler and missing cards have no active hotkey.

**Architecture:** Add a small player-feature hook around `react-hotkeys-hook`. Each rendered card calls this hook with its assigned key, its existing click handler, and its enabled state. `usePanelHotkeys` remains responsible only for panel-wide commands (`Space`, `L`, and `Escape`); Redux game actions and card-focus rules remain in the card components.

**Tech Stack:** React, TypeScript, `react-hotkeys-hook`, Redux Toolkit, Vitest, React Testing Library.

**Issue:** [#639](https://github.com/MemeBattle/monorepo/issues/639)

---

## Current input flow

```text
Q/W/E/R/T/X keydown
  -> CardsPanelContainer
  -> usePanelHotkeys
  -> useCardFocus().toggleFocus(target)

row/open-stack click
  -> rendered card component
  -> card-owned click handler
  -> focus toggle OR immediate Redux game action
```

The two paths duplicate the activation decision. A missing card can still have a panel-level target, and value-1/immediate-play behavior can diverge from pointer activation.

## Target input flow

```text
Rendered row card
  -> useCardHotkey(Q/W/E/R/T, onCardActivate, enabled)
  -> same onCardActivate used by Card.onClick
  -> focus toggle OR tapCardAction

Rendered open-stack card
  -> useCardHotkey(X, onCardActivate, enabled)
  -> same onCardActivate used by Card.onClick
  -> focus toggle OR tapStackOpenDeckCardAction

CardsPanelContainer
  -> usePanelHotkeys(Space/L/Escape only)
```

Because the hook is mounted by the card component, no rendered card means no hotkey registration.

---

## Hook contract and component usage

### New hook

**Create:** `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/useCardHotkey.ts`

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

The hook is internal to the player feature. It is not exported from `#features/player` or the card-focus public API.

### Row-card usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`

```ts
const onCardActivate = () => {
  if (isDndEnabled && card.value !== 1) {
    toggleFocus()
    return
  }

  clearFocus()
  dispatch(tapCardAction({ cardIndex: index }))
}

useCardHotkey(hotkey, onCardActivate, isDndEnabled)

return <Card onClick={onCardActivate} /* existing props */ />
```

The existing index-to-hotkey mapping remains:

```ts
;[Hotkey.q, Hotkey.w, Hotkey.e, Hotkey.r, Hotkey.t]
```

Only a rendered `PlayerRowCard` calls the hook. An empty row slot therefore cannot respond to its key.

### Open-stack usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`

```ts
const onCardActivate = () => {
  if (isDndEnabled && card.value !== 1) {
    toggleFocus()
    return
  }

  clearFocus()
  dispatch(tapStackOpenDeckCardAction())
}

useCardHotkey(Hotkey.x, onCardActivate, isDndEnabled)

return <Card onClick={onCardActivate} /* existing props */ />
```

`PlayerStackOpenCard` only mounts when `stackOpenDeckCard` exists, so `X` has no card handler for an empty open stack.

### Panel-wide usage

**Modify:** `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/usePanelHotkeys.ts`

```ts
useHotkeys(
  [Hotkey.space, Hotkey.l, Hotkey.escape].join(','),
  (event, handler) => {
    event.preventDefault()

    switch (handler.hotkey) {
      case Hotkey.space:
        clearFocus()
        dispatch(tapStackDeckCardAction())
        break
      case Hotkey.l:
        dispatch(tapLigrettoDeckCardAction())
        break
      case Hotkey.escape:
        clearFocus()
        break
    }
  },
  { enabled },
)
```

Delete the `Q/W/E/R/T/X` cases and the unused generic `toggleFocus` read. No card state selectors are added.

### Stack badge ownership

**Review/modify if needed:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx`

Keep the visual `X` badge aligned with actual availability. The badge should only advertise `X` when both manual controls are enabled and `stackOpenDeckCard` exists:

```tsx
<CardHotkeyBadge hotkey={isDndEnabled && stackOpenDeckCard ? Hotkey.x : undefined}>
```

The `Space` badge remains panel-wide because the closed-stack command remains in `usePanelHotkeys`.

---

## Implementation tasks

### Task 1: Add the card-hotkey hook with TDD

**Objective:** Create the reusable hook and prove enabled/disabled behavior.

**Files:**

- Create: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/useCardHotkey.ts`
- Create: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/useCardHotkey.spec.tsx`

**Steps:**

1. Write a jsdom test component that calls `useCardHotkey(Hotkey.q, onActivate, enabled)`.
2. Assert `Q` invokes `onActivate` once and prevents the browser default.
3. Assert disabled mode does not invoke the callback.
4. Assert an undefined hotkey does not register a handler.
5. Run the targeted spec and confirm RED because the hook does not exist.
6. Implement the minimal hook shown above.
7. Run the targeted spec and confirm GREEN.

**Command:**

```bash
cd apps/ligretto-frontend
node_modules/.bin/vitest run src/features/player/ui/CardsPanelContainer/useCardHotkey.spec.tsx
```

### Task 2: Move row hotkeys into rendered row cards

**Objective:** Route each row key through the exact same handler as a click.

**Files:**

- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`
- Test: add or create a focused integration spec near `PlayerRowCardsContainer`

**Steps:**

1. Write failing tests for a normal card, a value-1 card, and an empty row slot.
2. Extract/rename the existing click callback to `onCardActivate`.
3. Call `useCardHotkey(hotkey, onCardActivate, isDndEnabled)` inside `PlayerRowCard`.
4. Keep `Card.onClick={onCardActivate}`.
5. Verify ordinary cards toggle focus, value-1 cards dispatch `tapCardAction`, and missing cards have no handler.

### Task 3: Move `X` into the rendered open-stack card

**Objective:** Give the mounted open-stack card ownership of `X`.

**Files:**

- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`
- Modify: `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerCardsStack.tsx` if the badge needs availability gating
- Test: add or create a focused integration spec near `PlayerCardsStack`

**Steps:**

1. Write failing tests for a normal open-stack card, value `1`, and an absent open-stack card.
2. Reuse one `onCardActivate` callback for pointer and `X`.
3. Call `useCardHotkey(Hotkey.x, onCardActivate, isDndEnabled)` in `PlayerStackOpenCard`.
4. Hide the `X` badge when no open-stack card exists.
5. Verify value-1 dispatch and focus toggling match pointer behavior.

### Task 4: Reduce the panel hook to panel-wide commands

**Objective:** Remove card-specific hotkey ownership from `CardsPanelContainer`.

**Files:**

- Modify: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/usePanelHotkeys.ts`
- Keep: `apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer/CardsPanelContainer.tsx`

**Steps:**

1. Limit the registered keys to `Space`, `L`, and `Escape`.
2. Delete `Q/W/E/R/T/X` switch cases.
3. Remove `toggleFocus` from the hook result; retain `clearFocus`.
4. Verify Space clears focus then dispatches once, `L` dispatches once, and Escape only clears focus.

### Task 5: Documentation and full validation

**Objective:** Keep the architecture document and quality gates aligned.

**Files:**

- Modify: `docs/card-focus-management-plan.md`

**Document:**

- card-specific hotkeys are mounted by rendered card components;
- panel hook owns only panel-wide commands;
- keyboard and pointer share `onCardActivate`;
- missing cards have no handler.

**Validation:**

```bash
# repo root
./node_modules/.bin/oxfmt --check \
  docs/card-focus-management-plan.md \
  apps/ligretto-frontend/src/features/player/ui/CardsPanelContainer \
  apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack \
  apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer
./node_modules/.bin/oxlint apps/ligretto-frontend/src
git diff --check

# apps/ligretto-frontend
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
```

Expected: formatter/lint/typecheck succeed, all tests pass, production build succeeds, and the diff contains no implementation outside the paths listed above.

---

## Components and hooks affected

| Component/module                                     | Planned change                                                  | Hook usage after implementation                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PlayerRowCard` inside `PlayerRowCardsContainer.tsx` | Own `Q/W/E/R/T`; share activation handler with click            | `useCardFocus(target, deps)` + `useCardHotkey(hotkey, onCardActivate, isDndEnabled)`                   |
| `PlayerStackOpenCard`                                | Own `X`; share activation handler with click                    | `useCardFocus({ type: 'open-stack' }, deps)` + `useCardHotkey(Hotkey.x, onCardActivate, isDndEnabled)` |
| `PlayerCardsStack`                                   | Ensure the `X` badge is shown only when an open card exists     | No new hook; presentation gating only                                                                  |
| `CardsPanelContainer`                                | Continue enabling panel-wide hotkeys based on game/player state | Existing `usePanelHotkeys({ enabled })`                                                                |
| `usePanelHotkeys`                                    | Retain only Space/L/Escape                                      | `useHotkeys(...)` + `useCardFocus().clearFocus`                                                        |
| `useCardHotkey` (new)                                | Internal adapter for card-owned hotkeys                         | Wraps `useHotkeys` and invokes card callback                                                           |
| `CardFocusProvider` / `useCardFocus`                 | No API or behavior change                                       | Existing focus ownership remains unchanged                                                             |
| `PlaygroundContainer`                                | No change                                                       | Existing structured focused target remains unchanged                                                   |

## Non-goals

- No Redux state or action changes.
- No changes to `CardFocusProvider` or the public `useCardFocus` API.
- No generic command registry in focus context.
- No hotkeys for empty card locations.
- No changes to playground placement.
- No implementation code in this plan-only PR.

## Risks and mitigations

- **Duplicate handlers:** remove card-specific keys from `usePanelHotkeys` in the same implementation commit that mounts card-owned handlers.
- **Stale callback closure:** `useHotkeys` must receive the current card activation callback; tests rerender after card identity/value changes.
- **Hook ordering:** call `useCardHotkey` unconditionally inside mounted card components; control activation with `enabled`, not conditional hook calls.
- **Badge mismatch:** gate the open-stack `X` badge by actual card presence.
- **Immediate-play regression:** integration tests must explicitly cover value `1` for both row and open-stack cards.
