# Card Interaction

## Goal

`cardInteraction` owns transient user interaction with playable cards: which card is picked, which one
is being dragged, and which one is waiting for the server to confirm its placement. Authoritative game
state, card values and placement rules stay outside the feature.

## Public API

```ts
export { CardInteractionProvider } from './ui/CardInteractionProvider'
export { useCardInteraction } from './ui/useCardInteraction'
export { useDraggableCard } from './ui/useDraggableCard'
export { useDroppableTarget } from './ui/useDroppableTarget'
export { getInteractionTargetKey } from './ui/CardInteractionContext'
export { useCardHotkey } from './ui/useCardHotkey'
export type { CardDragData, CardDropTarget, CardInteractionTarget } from './model/types'
```

```ts
type CardInteractionTarget = { type: 'open-stack' } | { type: 'row'; index: number } | { type: 'playground'; index: number }
```

## Shared state

```ts
interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  placingTarget?: CardInteractionTarget
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
  startPlacing: (target: CardInteractionTarget) => void
  enabled: boolean
}
```

The reducer has four modes — `idle`, `focused`, `dragging`, `placing`. `activeTarget` covers `focused`
and `dragging`; `placingTarget` covers `placing`. Card data lives in dnd-kit's source data, never in
this context.

- Card press toggles `activeTarget`; a card hotkey does the same, so a repeated shortcut deselects.
- Drag start enters `dragging`; dnd-kit's terminal events return the reducer to `idle` unless the drop
  started a placement.
- Outside click, Escape, disabled interaction, card replacement or unmount clears the applicable
  selection.
- Commands that are not selections (stack Space, Ligretto `L`) clear the selection themselves, for
  both pointer and keyboard activation.

## Provider responsibilities

`CardInteractionProvider` is mounted at the nearest game boundary containing player cards and
playground decks. It owns the reducer, provider enablement, outside-click and Escape dismissal, the
dnd-kit `MouseSensor` / `TouchSensor`, drag lifecycle synchronization and invocation of the active
droppable callback. It also renders `CardDragOverlay`: the dragged card comes from the gesture's own
data, so no consumer has to mount or feed it. It has no game rules otherwise. The onboarding route
mounts its own provider around the interactive board.

## Hooks

### `useCardInteraction`

```ts
const { isActive, isDimmed, isPlacing, toggleActiveTarget } = useCardInteraction({ type: 'row', index }, card)
const { activeTarget, clearActiveTarget, startPlacing } = useCardInteraction()
```

The card is a parameter, not a selector result: the hook never reads the store, and the consumer
decides which card — if any — sits at that target. A change of card identity or unmount clears that
target's selection.

### `useDraggableCard`

```ts
const { id, isActive, isDimmed, isDragging, isPlacing, listeners, setNodeRef, toggleActiveTarget } = useDraggableCard(target, card)
```

A playable card calls this one hook: it registers the drag source and runs `useCardInteraction` for
the same target and card. The card component owns ref/listener application, data attributes and the
`isInvisible` flag it passes to `Card`. Cards that cannot be dragged — the onboarding's — use `useCardInteraction` on its
own.

### `useDroppableTarget`

```ts
const { id, isOver, onClick, setNodeRef } = useDroppableTarget({ type: 'playground', index }, onPlace)
```

The hook owns both entry points into a placement — a drop on the surface and a click on it while a
card is picked — and guards delivery on provider enablement. Validity and its visual treatment belong
to the owner: `onPlace(source, card?)` re-reads the live source and destination from the store,
checks identity and `canPlaceCardOnDeck`, dispatches, and returns whether it did. An accepted
placement enters the placing state.

### `useCardHotkey`

```ts
useCardHotkey(Hotkey.q, onActivate)
```

Invokes its owner, nothing more. It neither cancels pending or active sensors nor suppresses their
release clicks.

## Placement flow

Click placement:

```text
card press/hotkey
→ activeTarget
→ playground deck click
→ onPlace re-reads source and destination, checks canPlaceCardOnDeck, dispatches putCard
→ placing state
→ backend validation
→ authoritative state clears the placing source
```

Drag placement:

```text
drag start
→ dragging mode + native source data
→ release on a destination
→ provider validates connected, enabled source/destination and invokes the droppable callback
→ onPlace re-reads source and destination, checks identity and canPlaceCardOnDeck, dispatches putCard
→ placing state
→ backend validation
→ authoritative state clears the placing source
```

While `placing` holds, the source card stays `isInvisible`, so it does not reappear in its slot
between the drop and the state update. A move the server never answers falls back to a timeout in the
provider. Every card value, including `1`, requires an explicit destination.

## Visual feedback

`PlaygroundDeck` outlines only the deck under the pointer. Decks that would accept the dragged card
are deliberately not highlighted in the game — locating them is the skill Ligretto is played for. The
onboarding highlights them instead, except for a value-1 card, which fits every empty deck.

## DOM ownership

- Interactive card roots use `data-card-interaction-element`.
- The document click listener preserves interaction inside marked card/playground surfaces and clears
  it elsewhere.
- `PlaygroundDeck` places its droppable surface inside `CardPlace` and gives empty targets explicit
  responsive dimensions.
- `Card` forwards only explicitly declared DnD ref/input-handler props — no `style` passthrough; a
  hidden drag source asks for `isInvisible` instead — and chains its press activation with an
  incoming `onMouseDown` instead of replacing it.

## State boundaries

- React context: transient selection, drag and placing state.
- dnd-kit: native gesture and source/destination data; the provider renders the overlay from it.
- Redux/shared actions: placement commands.
- Gameplay backend: authoritative destination validation and mutation.
- Shared package: pure `canPlaceCardOnDeck` rule reused for UI decisions and backend validation.

## Validation

```bash
pnpm fmt:check
pnpm lint:check
pnpm ts-check
pnpm test:ci

cd apps/ligretto-frontend
pnpm build
```
