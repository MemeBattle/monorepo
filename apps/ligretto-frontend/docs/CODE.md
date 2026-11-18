# Code

How React code is written in this package.

## A component owns its behaviour

A component that does something reads its own state with selectors, defines its own handlers and dispatches its own
actions (`RoomInviteLink` reads the room id, shares the link and shows the feedback itself). Its parent renders it and
passes what identifies it (a card, an index, a hotkey), not handlers, flags or state derived for it. Behaviour added
to a part of a screen becomes a component that owns it, with its helpers next to it, rather than a branch in the
parent or a handler threaded down from a `*Container`. The existing `*Container` components predate this rule: a
change does not add handlers to them for a child to call, and does not rework them unless the task is that rework.

## Hooks and providers expose the minimum

- A hook returns state and handlers (`isActive`, `isDragging`, `listeners`), never styles, so the component decides
  how it looks.
- Whether a component under a provider may act is the provider's state, read from its context
  (`useCardInteractionContext().enabled`). The component and the hooks it calls take no `enabled` or `disabled`
  prop or argument of their own: being rendered under the provider is what turns them on.
- A context has one accessor, which throws outside its provider (`useCardInteractionContext`); no optional variant
  that returns `undefined` for callers to check.

## UI state follows the design

A component shows the states the design or the task shows, and no others: no pending, disabled or intermediate state
added on the way. Feedback the design asks for is built as described (a tooltip that stays for two seconds) without
changing how the rest of the element looks or behaves.

## Input

`Card` acts on `mousedown`, not on `click`: the game rewards speed, so a card reacts on press, and the drag sensors
listen on the same event. A change to pointer, touch, drag or hotkey handling keeps every existing path working and
is checked on each: a mouse click, a touch tap (a short touch that does not move is a tap, not a drag), a double tap
that must not act twice, and the keyboard alone, including deselecting a card with `Escape`.
