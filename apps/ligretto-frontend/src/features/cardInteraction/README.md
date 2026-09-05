# Card interaction ownership

`CardInteractionProvider` owns one nullable `activeTarget` shared by selection and
native drag gestures. It provides sensors, outside-click dismissal, Escape and
provider enablement. It does not read Redux, select cards, validate placement,
dispatch game commands, or render a card.

Components opt into behavior through hooks:

- `useCardInteraction(target, identityDependencies)` supplies selection flags and
  pointer toggling. Identity changes and unmount clear only that target. The
  argument-free overload exposes the current target and explicit clearing.
- `useDraggableCard(target, card, disabled?)` attaches the native source to the
  component's own element. Card/target identity changes, disablement and unmount
  invalidate selection; components decide how to hide the original while dragging.
- `useDroppableTarget(target, onDrop)` attaches a semantic destination and invokes
  its owner only for a live source/destination with an unchanged active target.
  The owner validates current game rules and dispatches its own command.
- `useCardInputEnabled()` combines provider enablement with native drag ownership.
  Use it for shortcut hints and availability, not a separate game-state flag.
- `useCardAction(callback, available?)` gates immediate pointer commands and clears
  selection before invoking their owner. It returns no handler while unavailable.
- `useCardHotkey(key, callback)` clears selection before invoking an enabled owner.
  It has no options object. Clearing then toggling deliberately keeps a repeated
  row/open-stack shortcut selected; pointer activation still toggles it off.
- `useCardDragTarget()` derives a live drag target from dnd-kit and the shared
  selection. `PlayerCardDragOverlay` uses it to look up current Redux data and
  render the dnd-kit presentation primitive and game card outside this feature.

The target union and `getInteractionTargetKey` cover row, open-stack and playground
identities. Hooks return behavior/data, never styles or card wrapper elements.

## Gesture and command semantics

A native drag owns input until release or Escape, including after invalidation:
other pointer activations and gameplay shortcuts must not select a replacement
source and resurrect that gesture. No second drag mode, source registry or stored
active card is needed. Invalid, cancelled and stale drops do not dispatch.
Re-enabling the provider does not restore a cleared gesture.

Click placement deliberately keeps its selected source until a server-confirmed
card identity update. It continues to submit the explicit destination to backend
validation, whereas drag owners prevalidate against their current destination.
Do not clear click selection optimistically or auto-place value-1 source cards.

Onboarding keeps its dedicated playground, callback routing and outline refs.
Its source owners include step availability in their identity dependencies so a
selection cannot outlive the step that enabled it.

## Tests

Feature tests drive real dnd-kit mouse events without a Redux provider; component
tests verify command payloads, overlay/source visibility, shortcut availability,
repeated selection, onboarding refs and stale/disabled/cancelled gestures. The
native mouse sensor suppresses document clicks for 50 ms after release; tests that
mix drag and click cases must allow that teardown to finish. No new E2E harness is
required by this refinement.
