# Card Interaction

## Goal

`cardInteraction` owns transient user interaction with playable cards. Selection uses an `idle | focused | dragging` reducer with a nullable `activeTarget`; native dragging remains independent of subsequent hotkey selection and authoritative game state and placement validation remain outside this feature.

## Public API

```ts
export { CardInteractionProvider } from './ui/CardInteractionProvider'
export { useCardInteraction } from './ui/useCardInteraction'
export { useDraggableCard } from './ui/useDraggableCard'
export { useDroppableTarget } from './ui/useDroppableTarget'
export { useCardDragTarget } from './ui/useCardDragTarget'
export { getInteractionTargetKey } from './ui/CardInteractionContext'
export { useCardHotkey } from './ui/useCardHotkey'
export type { CardDragData, CardDropTarget, CardInteractionTarget } from './model/types'
```

```ts
type CardInteractionTarget = { type: 'open-stack' } | { type: 'row'; index: number } | { type: 'playground'; index: number }
```

## Shared active target

```ts
interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
  runCommand: (command: () => void) => void
}
```

`activeTarget` is `undefined` when the selection reducer is idle. Native drag data lives in dnd-kit, not in this context.

- Card click toggles `activeTarget`; card hotkey clears the previous target before activating its owner.
- Drag start sets `activeTarget` and enters the dragging mode; card data remains in native source data.
- Native drag end or the standard dnd-kit `onDragCancel` lifecycle clears a matching dragging state, without clearing later hotkey focus.
- Outside click, disabled interaction, card replacement or unmount clears the applicable selection, not the native sensor.
- Hotkeys remain available during dragging and do not prevent an otherwise valid drop. There is no explicit Escape interception or custom cancellation.

## Provider responsibilities

`CardInteractionProvider` is mounted at the nearest game boundary containing player cards and playground decks. It owns:

- the selection reducer and central provider enablement;
- outside-card dismissal;
- standard dnd-kit `MouseSensor` and `TouchSensor`;
- drag start/end and standard `onDragCancel` state synchronization;
- invocation of the active droppable callback.

The game-owned `PlayerCardDragOverlay` uses `useCardDragTarget` to derive the live native source independently of selection, selects current Redux card data and renders the overlay. The provider has no game rules or visual ownership.

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

### `useDroppableTarget`

Returns behavioral drop state only:

```ts
const { id, isOver, setNodeRef } = useDroppableTarget({ type: 'playground', index }, onDrop)
```

The hook composes the DnD ID from the semantic target. `PlaygroundDeck` owns target dimensions, validity rules, visual feedback, and data attributes. `isOver` is sufficient for hover behavior.

### `useCardHotkey`

Every available card hotkey clears `activeTarget` before invoking its owner callback. It neither cancels pending/active native sensors nor suppresses their release clicks. A hotkey may focus another card while the original native drag continues with its source and overlay unchanged.

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
→ activeTarget + native source data
→ native release on a destination
→ provider validates live, enabled source/destination
→ provider invokes droppable callback
→ destination owner validates card/deck
→ explicit putCard action
→ matching dragging state cleared (later hotkey focus retained)
→ backend validation
```

Every card value, including `1`, requires an explicit destination. There is no automatic placement path.

## DOM ownership

- Interactive card roots use `data-card-interaction-element`.
- The document click listener preserves interaction inside marked card/playground surfaces and clears it elsewhere.
- `PlaygroundDeck` places its droppable surface inside `CardPlace` and gives empty targets explicit responsive dimensions.
- `Card` forwards only explicitly declared DnD ref/style/input-handler props.

## State boundaries

- React context: transient selection state.
- dnd-kit: native gesture and source/destination data; game UI owns the overlay.
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
