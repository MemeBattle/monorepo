# Card Interaction

## Goal

`cardInteraction` owns transient user interaction with playable cards. Click-to-select and drag-and-drop use the same nullable `activeTarget`; authoritative game state and placement validation remain outside this feature.

## Public API

```ts
export { CardInteractionProvider } from './ui/CardInteractionProvider'
export { useCardInteraction } from './ui/useCardInteraction'
export { useDraggableCard } from './ui/useDraggableCard'
export { useDroppableCard } from './ui/useDroppableCard'
export type { CardDragData, CardInteractionTarget } from './model/types'
```

```ts
type CardInteractionTarget = { type: 'open-stack' } | { type: 'row'; index: number }
```

## Shared active target

```ts
interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  activeCard?: Card
  enabled: boolean
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
}
```

`activeTarget` is `undefined` when no card is selected or dragged.

- Card click/hotkey toggles `activeTarget`.
- Drag start sets the same `activeTarget` and stores card data for preview/drop validation.
- Successful drop, cancellation, Escape, outside click, disabled interaction, card replacement, or unmount clears it.
- No interaction mode is stored. Click and drag hooks own their input-specific details.

## Provider responsibilities

`CardInteractionProvider` is mounted at the nearest game boundary containing player cards and playground decks. It owns:

- `activeTarget` and drag-preview card data;
- Escape and outside-card dismissal;
- mouse/touch DnD sensors;
- drag overlay;
- drag start/end/cancel lifecycle;
- invocation of the active droppable callback.

The onboarding route mounts its own provider around the interactive board.

## Hooks

### `useCardInteraction`

Targeted card usage:

```ts
const { isActive, isDimmed, toggleActiveTarget } = useCardInteraction({ type: 'row', index }, [card.color, card.value])
```

Integration usage:

```ts
const { activeTarget, clearActiveTarget } = useCardInteraction()
```

Target identity dependencies clear stale interaction when the card at a location changes or unmounts.

### `useDraggableCard`

Returns behavioral DnD data only:

```ts
const { id, isDragging, listeners, setNodeRef } = useDraggableCard(target, card)
```

The card component owns ref/listener application, data attributes, opacity, and touch styling.

### `useDroppableCard`

Returns behavioral drop state only:

```ts
const { isOver, isValid, setNodeRef } = useDroppableCard(id, cardDeck, onDrop)
```

`PlaygroundDeck` owns target dimensions, visual feedback, and data attributes. The hook validates the current dragged card against the current deck before invoking `onDrop`.

## Placement flow

Click placement:

```text
card click/hotkey
→ activeTarget
→ playground deck click
→ explicit putCard action
→ backend validation
```

Drag placement:

```text
drag start
→ activeTarget + preview card
→ droppable validates card/deck
→ provider invokes droppable callback
→ explicit putCard action
→ activeTarget cleared
→ backend validation
```

Every card value, including `1`, requires an explicit destination. There is no automatic placement path.

## DOM ownership

- Interactive card roots use `data-card-interaction-element`.
- The document click listener preserves interaction inside marked card/playground surfaces and clears it elsewhere.
- `PlaygroundDeck` places its droppable surface inside `CardPlace` and gives empty targets explicit responsive dimensions.
- `Card` forwards only explicitly declared DnD ref/style/input-handler props.

## State boundaries

- React context: transient `activeTarget` and drag preview.
- Redux/shared actions: placement commands.
- Gameplay backend: authoritative destination validation and mutation.
- Shared package: pure `canPlaceCardOnDeck` rule reused for UI feedback and backend validation.

## Validation

```bash
pnpm fmt:check
pnpm lint:check
pnpm ts-check
pnpm test:ci

cd apps/ligretto-frontend
pnpm build
```
