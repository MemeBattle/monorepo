# Card interaction ownership

`CardInteractionProvider` owns an `idle | focused | dragging | placing` reducer, the dnd-kit
mouse/touch sensors, outside-click and Escape dismissal, and provider enablement (descendants become
natively `inert`). It does not read Redux, does not know card values, does not validate game rules,
does not dispatch commands. The only thing it renders is the drag overlay, because the dragged card
comes from the gesture rather than from the game.

The feature is value-agnostic on purpose: everything that needs to know _which_ card sits at a target
lives with the consumer that already owns that data — gameplay in `#features/playground` and
`#features/player`, the tutorial in `#pages/onboarding`.

## Hooks

- `useCardInteraction(target, card)` returns `isActive`, `isDimmed`, `isPlacing` and
  `toggleActiveTarget`. The card is passed in, not selected: a change of its color/value, a change of
  target identity, or unmount clears that target and nothing else. Passing `undefined` as the card is
  how a consumer says "this source is not available right now" (the onboarding uses it when a step
  disallows a card).
  The argument-free overload returns `activeTarget`, `clearActiveTarget` and `startPlacing`.
- `useDraggableCard(target, card)` is the whole hook a playable card needs: it registers the drag
  source and runs `useCardInteraction` for the same target, returning `id`, `isDragging`, `listeners`
  and `setNodeRef` next to `isActive`, `isDimmed`, `isPlacing` and `toggleActiveTarget`. The component
  owns visibility and styles. Cards that are not draggable (the onboarding's) use
  `useCardInteraction` directly.
- `useDroppableTarget(target, onPlace)` owns both ways a card reaches a destination: a drop on it and
  a click on it after the card was picked. It returns `id`, `isOver`, `onClick` and `setNodeRef`.
  It has no notion of validity — `onPlace(source, card?)` decides whether the placement is legal and
  returns whether it dispatched a command, and an accepted placement enters the placing state. What,
  if anything, to draw for a valid destination is the owner's call too.
- `useCardDragTarget()` returns the live `{ target, card }` of the current drag, read from the
  draggable's own data. It stays internal: the provider renders `CardDragOverlay` with it, so the
  card that follows the pointer needs no store lookup and no wiring from the game.
- `useCardHotkey(key, callback)` invokes its owner and nothing else. A repeated card shortcut toggles
  the selection off, exactly like repeated pointer activation. Commands that are not selections
  (Space on the stack, `L` on the Ligretto deck) clear the selection themselves.

## Activation and gestures

Cards activate on press (`onMouseDown`), the speed-game behavior from LIG-144. `Card` chains the
incoming drag listener with its own activation instead of replacing it, so both run. Mouse dragging
starts after 6 px of movement, touch dragging after 8 px, so a stationary press activates without
starting a drag. `Card` itself sets `touch-action: none`, so the browser never takes a touch that
begins on a card as a pan and cancels the gesture.

Hotkeys stay available during a gesture, neither cancelling a drag nor preventing a valid drop.
Escape clears the selection while a card is focused. There are no custom sensors and no release-click
guards; standard dnd-kit terminal events synchronize the reducer.

## Placing

A placement is a round trip: the command is dispatched, the server answers with authoritative state.
`startPlacing(target)` puts the reducer into `placing`, and the source renders as `isInvisible` while
`isPlacing` holds, so the card does not flash back into its slot between the drop and the state
update. The state ends when the card under that target changes (the source's own cleanup clears it)
and, as a safety net for a move the server never answers, after `PLACEMENT_TIMEOUT_MS`.

## What the game does not show

`PlaygroundDeck` outlines only the deck under the pointer. Which decks accept the dragged card is not
highlighted: finding them is the scanning the game is about. The onboarding does the opposite and
highlights the decks its card can go to — except for a value-1 card, which fits every empty deck and
would light up most of the table.
