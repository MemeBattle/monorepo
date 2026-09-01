# Card Drag-and-Drop Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add mouse and touch drag-and-drop placement for row and open-stack cards while preserving click-to-focus, card hotkeys, and backend-authoritative validation.

**Architecture:** Introduce a `cardPlacement` feature that owns drag sensors, source/drop hooks, and drag preview state. The provider invokes the callback stored in the droppable element's data; `PlaygroundContainer` keeps placement-command routing. A dedicated `PlaygroundDeck` owns card extraction and applies the drop hook inside `CardPlace`. Share the card-on-deck validity rule between frontend feedback and backend validation, but continue treating the backend as authoritative.

**Tech Stack:** React 19, TypeScript, Redux Toolkit, `@dnd-kit/core`, MUI, Vitest/React Testing Library.

**Issue:** [#685](https://github.com/MemeBattle/monorepo/issues/685)

---

## Current interaction flow

```text
normal card click/hotkey
  -> useCardFocus(target).toggleFocus()
  -> PlaygroundContainer reads focusedCard
  -> playground card click
  -> dispatch putCardAction / putCardFromStackOpenDeck

all card values, including value 1
  -> focus through click/hotkey
  -> require an explicit playground destination
```

`PlaygroundContainer` currently owns placement-command construction. `Playground` renders twelve `CardPlace` slots, but only occupied slots contain a clickable `Card`; empty slots have no pointer interaction. `Card` maps its `onClick` prop to DOM `onMouseDown`, which would activate the existing click behavior before a drag sensor can distinguish click from drag.

## Target interaction flow

```text
GameContainer
  -> CardFocusProvider
  -> CardPlacementProvider / DndContext
       -> PlayerRowCard / PlayerStackOpenCard: draggable source
       -> PlaygroundDeck/useDroppableCard: droppable destination

pointer/touch drag
  -> source metadata { target, card }
  -> valid targets highlighted
  -> drop on valid deck
  -> droppable callback receives { target, card }
  -> existing Redux/socket placement command
  -> clear focused card

click/hotkey
  -> existing behavior unchanged
```

Drag-and-drop is additive. It does not replace the accessible click/hotkey path.

---

## Library decision

Add `@dnd-kit/core` to the workspace catalog and Ligretto frontend dependencies.

Why:

- supports mouse, touch, and Pointer Events through explicit sensors;
- provides `DragOverlay`, cancellation, collision detection, announcements, and lifecycle callbacks;
- does not require HTML5 drag events, which are unreliable for touch;
- supports attaching drag behavior to wrappers without coupling the generic `Card` entity to gameplay commands.

Do not use the existing `react-dropzone` dependency: it is designed for dropping external files, not moving application UI objects.

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `apps/ligretto-frontend/package.json`
- Modify: `pnpm-lock.yaml`

Use the repository's catalog convention; do not add a direct ad-hoc version only in the app manifest.

---

## New `cardPlacement` feature

### Public surface

**Create:** `apps/ligretto-frontend/src/features/cardPlacement/index.ts`

Export only:

```ts
export { CardPlacementProvider } from './ui/CardPlacementProvider'
export { useDraggableCard } from './ui/useDraggableCard'
export { useDroppableCard } from './ui/useDroppableCard'
export type { CardPlacementTarget } from './model/types'
```

### Placement target and drag payload

**Create:** `apps/ligretto-frontend/src/features/cardPlacement/model/types.ts`

```ts
export type CardPlacementTarget = { type: 'open-stack' } | { type: 'row'; index: number }

export interface CardDragData {
  target: CardPlacementTarget
  card: Card
}
```

Keep card location separate from card identity. Generate draggable IDs from both:

```ts
row.0.red.2
open-stack.blue.5
```

A card replacement produces a new draggable identity for that location.

### Provider responsibilities

**Create:** `apps/ligretto-frontend/src/features/cardPlacement/ui/CardPlacementProvider.tsx`

The provider:

1. creates mouse and touch sensors;
2. uses a movement threshold for mouse/pointer activation so a normal click remains a click;
3. uses a short touch delay plus movement tolerance so page scrolling and taps are not immediately captured;
4. tracks the active `CardDragData` for target styling and `DragOverlay`;
5. reads the callback from the active droppable element's data and invokes it with `CardDragData`;
6. resets drag state on cancel, provider disable, and game lifecycle transitions;
7. renders a `DragOverlay` card preview detached from layout.

Suggested sensor setup:

```ts
const sensors = useSensors(
  useSensor(MouseSensor, {
    activationConstraint: { distance: 6 },
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 8 },
  }),
)
```

Do not register a DnD keyboard sensor in the first implementation. Existing card hotkeys and click-to-focus/place remain the keyboard-accessible alternative and must not conflict with DnD-specific key bindings.

### Source and destination hooks

**Create:**

- `apps/ligretto-frontend/src/features/cardPlacement/ui/useDraggableCard.ts`
- `apps/ligretto-frontend/src/features/cardPlacement/ui/useDroppableCard.ts`

```ts
const draggable = useDraggableCard(target, card)
const droppable = useDroppableCard(id, cardDeck, onDrop)
```

The card owner applies the returned listener/ref/state properties to `Card` and owns source styling. `PlaygroundDeck` applies the returned ref/validity state to a node inside `CardPlace` and owns target styling. The drop hook validates against `cardDeck` before invoking `onDrop`.

### Provider placement

**Modify:** `apps/ligretto-frontend/src/widgets/game/ui/GameContainer.tsx`

```tsx
<CardFocusProvider enabled={isInteractionEnabled}>
  <CardPlacementProvider enabled={isInteractionEnabled}>
    <GameGrid ... />
  </CardPlacementProvider>
</CardFocusProvider>
```

This is the narrowest common owner containing both the player's card sources and the playground targets. Spectator and non-`InGame` states disable both providers.

---

## Shared placement validation

Valid-target highlighting must follow the same card rule as the backend.

### Extract pure rule

**Create:** `packages/ligretto-shared/src/cardPlacement.ts`

```ts
export const canPlaceCardOnDeck = (card: Card, deck: CardsDeck | null | undefined): boolean => {
  const topCard = deck?.cards.at(-1)

  if (!topCard) {
    return card.value === 1
  }

  return topCard.color === card.color && topCard.value + 1 === card.value
}
```

**Modify:** `packages/ligretto-shared/src/index.ts` to export it.

### Backend migration

**Modify:** `apps/ligretto-gameplay-backend/src/entities/playground/playground.service.ts`

Replace its private duplicate `isDeckAvailable` rule with the shared pure function for:

- explicit destination validation;
- mutation guard in `putCard`.

Backend validation remains authoritative. Frontend validity only controls visual feedback and whether the client dispatches an obviously invalid drop.

### Rule tests

**Create:** `packages/ligretto-shared/src/cardPlacement.spec.ts`

Cover:

- value `1` on `null`/empty deck;
- values `2..10` rejected on empty deck;
- same-color next value accepted;
- wrong color, skipped value, duplicate value, and undefined/out-of-range deck rejected.

Retain or update backend tests so extraction cannot weaken server-side validation.

---

## Draggable card sources

### Draggable hook

**Create:** `apps/ligretto-frontend/src/features/cardPlacement/ui/useDraggableCard.ts`

The hook calls `useDraggable(target, card)` and returns only the draggable ID, dragging state, listeners, and node ref. The card owner applies data attributes, opacity, and touch styling.

The card owner attaches the returned ref/listeners, adds drag data attributes, scopes `touch-action: none`, and reduces opacity while dragging. The hook does not own styling, click, hotkey, focus, or Redux behavior.

`Card` only forwards the returned DOM props/ref; it does not decide which cards are draggable.

### Row card integration

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer.tsx`

```tsx
<CardHotkeyBadge hotkey={hotkey}>
  <Card {...card} {...listeners} ref={setNodeRef} data-card-drag-id={id} style={dragStyle} onClick={onCardActivate} />
</CardHotkeyBadge>
```

All rendered row cards, including value `1`, are draggable and use explicit destination placement.

### Open-stack integration

**Modify:** `apps/ligretto-frontend/src/features/player/ui/PlayerCardsStack/PlayerStackOpenCard.tsx`

Call `useDraggableCard({ type: 'open-stack' }, card)` and apply the returned properties to the visible open card. Preserve `X`, click activation, and focus identity dependencies.

### Click versus drag correction

**Modify:** `apps/ligretto-frontend/src/entities/card/ui/Card/Card.tsx`

The current `onClick` prop is wired to DOM `onMouseDown`; this fires before drag activation is known. Change it to actual `onClick`:

```tsx
<StyledCard onClick={onClick} ... />
```

Do not dispatch card activation on `pointerdown`/`mousedown`. The sensor activation threshold separates tap/click from drag, and a completed drag must not emit the card click action afterward.

Audit all `Card` consumers. Existing code already names this prop `onClick`, so no public prop rename is required.

---

## Playground drop targets

### Drop-target hook and deck component

**Create:**

- `apps/ligretto-frontend/src/features/cardPlacement/ui/useDroppableCard.ts`
- `apps/ligretto-frontend/src/features/playground/ui/PlaygroundDeck/PlaygroundDeck.tsx`

`PlaygroundDeck` receives the complete `CardsDeck | null`, extracts its visible card, and applies the drop hook to a node inside `CardPlace`. The hook stores an `onDrop(CardDragData)` callback in droppable data and validates against the current deck before invoking it.

It computes:

- `isValid`: active card exists and `canPlaceCardOnDeck(activeCard, deck)`;
- `isOver`: pointer currently overlaps this target;
- visual state: idle, valid, valid-hover, invalid-hover.

Invalid targets stay discoverable but must not dispatch on drop. Use color plus a non-color cue (border style/overlay icon) for accessibility.

### Render all twelve targets

**Modify:**

- `apps/ligretto-frontend/src/features/playground/ui/Playground.tsx`
- `apps/ligretto-frontend/src/features/playground/ui/TableCards/TableCards.tsx` only if layout/ref forwarding requires it
- `apps/ligretto-frontend/src/entities/card/ui/CardPlace/CardPlace.tsx` only if drop-state styling belongs on the slot itself

Every slot, including `null` slots, contains a drop target inside its `CardPlace`. Value `1` is valid on an empty slot through explicit placement.

Keep the existing `data-test-id="Playground-Deck-${index}"` on the actual target node so click and browser tests use the same destination.

### Existing click placement

**Modify:** `apps/ligretto-frontend/src/features/playground/ui/PlaygroundContainer.tsx`

Keep command construction in the playground container and provide click/drop callbacks:

```ts
const { focusedCard } = useCardFocus()

const handlePlaygroundDeckClick = (index: number) => {
  if (focusedCard) {
    dispatch(
      focusedCard.type === 'row'
        ? putCardAction({ cardIndex: focusedCard.index, gameId, playgroundDeckIndex: index })
        : putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: index }),
    )
  }
}
```

The droppable hook validates drag/drop and calls the callback carried by that deck. The provider remains generic and only invokes the droppable callback. Keep click behavior on occupied cards.

---

## Focus and lifecycle behavior

- Starting a drag does not toggle or clear focus.
- Invalid/cancelled drag leaves the pre-drag focus unchanged.
- Valid drop dispatches exactly one placement command and calls parameterless `useCardFocus().clearFocus()`.
- Card identity remains part of the draggable ID.
- Disabling the provider on pause/end/spectator transition clears active drag state and renders no overlay.
- Outside-click focus handling must not treat sensor/overlay internals as card clicks; cancellation must still be safe if it does.
- Drag overlay is presentation only and must not register card hotkeys, focus handlers, or another draggable.

---

## Test strategy (TDD)

### Task 1: Shared rule extraction

**Files:**

- Create: `packages/ligretto-shared/src/cardPlacement.spec.ts`
- Create: `packages/ligretto-shared/src/cardPlacement.ts`
- Modify: `packages/ligretto-shared/src/index.ts`
- Modify: `apps/ligretto-gameplay-backend/src/entities/playground/playground.service.ts`

1. Write rule tests first and verify RED.
2. Add the shared function.
3. Migrate backend validation.
4. Run shared and gameplay backend tests.

### Task 2: Correct Card activation semantics

**Files:**

- Modify: `apps/ligretto-frontend/src/entities/card/ui/Card/Card.tsx`
- Update `cardOwnedHotkeys.spec.tsx`

1. Change DOM wiring from `onMouseDown` to `onClick`.
2. Verify existing card-owned pointer/hotkey behavior remains green.

### Task 3: Placement provider and command reuse

**Files:**

- Create feature files under `apps/ligretto-frontend/src/features/cardPlacement/`
- Modify: `PlaygroundContainer.tsx`
- Modify: `GameContainer.tsx`

Tests must prove:

- row and open-stack targets produce the existing exact actions;
- a valid drop dispatches once and clears focus;
- invalid, outside, and cancelled drops dispatch nothing and preserve focus;
- provider disable cancels active drag state.

### Task 4: Source and destination integration

**Files:**

- Modify row/open-stack owners;
- Modify `Playground.tsx` and drop-target UI;
- Add `cardDragPlacement.spec.tsx` under the feature or player integration tests.

Cover:

- normal row card;
- normal open-stack card;
- value-1 explicit empty-deck drop;
- invalid target feedback;
- empty deck registration;
- overlay/source visual state;
- click and hotkey regressions.

Use real `DndContext` behavior where jsdom permits it; mock only geometry/sensor details that jsdom cannot represent.

## Files expected to change

| Path                                                                           | Change                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `pnpm-workspace.yaml`, frontend `package.json`, `pnpm-lock.yaml`               | Add the DnD dependency                                       |
| `packages/ligretto-shared/src/cardPlacement.ts`                                | Shared pure placement rule                                   |
| `packages/ligretto-shared/src/index.ts`                                        | Export rule                                                  |
| `apps/ligretto-gameplay-backend/src/entities/playground/playground.service.ts` | Reuse shared rule                                            |
| `apps/ligretto-frontend/src/features/cardPlacement/**`                         | Provider, source/drop hooks, action factory, tests           |
| `GameContainer.tsx`                                                            | Add placement provider at common owner                       |
| `PlayerRowCardsContainer.tsx`                                                  | Apply the draggable hook to row cards                        |
| `PlayerStackOpenCard.tsx`                                                      | Apply the draggable hook to the open-stack card              |
| `PlaygroundContainer.tsx`                                                      | Own click/drop placement callbacks                           |
| `Playground.tsx` / `PlaygroundDeck.tsx`                                        | Encapsulate each deck and place drop target inside CardPlace |
| `Card.tsx`                                                                     | Use actual click semantics instead of mousedown activation   |
| Card/player/focus specs                                                        | Regression and integration coverage                          |
| `docs/card-focus-management-plan.md`                                           | Document focus/drag interaction ownership                    |

## Non-goals

- No drag-and-drop for opponent cards, Ligretto deck, closed stack deck, onboarding cards, or spectator UI.
- No replacement of click-to-focus/place or hotkeys.
- No optimistic local game-state mutation.
- No keyboard DnD sensor in the first version; keyboard placement remains available through existing controls.

## Validation

```bash
# Root
pnpm fmt:check
pnpm lint:check
pnpm ts-check
pnpm test:ci
git diff --check

# Frontend
cd apps/ligretto-frontend
pnpm ts-check
pnpm test:ci
pnpm build

# Gameplay backend after shared-rule migration
cd ../ligretto-gameplay-backend
pnpm ts-check
pnpm test
```

Manual verification matrix:

1. mouse-drag row card to valid and invalid targets;
2. mouse-drag open-stack card;
3. touch-drag on a narrow viewport without accidental page scroll;
4. drag value `1` to a chosen empty slot;
5. click/hotkey value `1` still auto-places;
6. click/hotkey normal card still focuses, then click placement still works;
7. cancel by releasing outside, pressing Escape, card replacement, and game pause/end;
8. spectator/inactive UI exposes no draggable sources.

## Risks and mitigations

- **Card activates before drag:** move generic Card activation from `mousedown` to real `click` and use sensor thresholds.
- **Touch blocks scrolling:** scope `touch-action` to draggable surfaces and use a delayed touch sensor.
- **Frontend/backend rule drift:** share the pure card-on-deck rule, while retaining backend validation.
- **Duplicate placement dispatch:** share action construction while keeping destination callbacks in `PlaygroundContainer`.
- **Stale source data:** include card identity in draggable IDs.
- **Empty slots are not interactive today:** register the drop hook inside all twelve `CardPlace` slots.
- **Drag overlay triggers interactions:** render a presentation-only Card with no handlers/hotkeys.
