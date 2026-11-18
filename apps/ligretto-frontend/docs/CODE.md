# Code

How React code is written in this package.

## A component owns its behaviour

A feature or widget component that does something reads its own state with selectors, defines its own handlers and
dispatches its own actions (`RoomInviteLink` reads the room id, shares the link and shows the feedback itself). Its
parent renders it and passes what identifies it (a card, an index, a hotkey), not handlers, flags or state derived for
it. Behaviour added to a part of a screen becomes a component that owns it, with its helpers next to it, rather than a
branch in the parent or a handler threaded down from a `*Container`. The existing `*Container` components predate this
rule: a change does not add handlers to them for a child to call, and does not rework them unless the task is that
rework.

Presentational components (`entities/*/ui`, `@memebattle/ui`) are the exception: they take state and handlers as props
(`Card`'s `onClick`), and the component that owns the behaviour passes them.

## Hooks and providers expose the minimum

- A hook returns state and handlers (`isActive`, `isDragging`, `listeners`), never styles, so the component decides
  how it looks.
- Whether a component under a provider may act is the provider's state, read from its context
  (`useCardInteractionContext().enabled`). The component and the hooks it calls take no `enabled` or `disabled`
  prop or argument of their own: being rendered under the provider is what turns them on.
- A hook that reads a context throws outside its provider (`useCardInteractionContext`) rather than returning
  `undefined` or a fallback for callers to handle. The onboarding target refs (`src/pages/onboarding/targets.tsx`)
  predate this rule.

## UI state follows the task

A component shows the states its task (the issue's text, mockups or linked design) shows. A state it does not show
(pending, disabled, intermediate) is added only when the behaviour cannot work without it, and the pull request
description says so.

## Input

`Card` acts on `mousedown`, not on `click`: the game rewards speed, so a card reacts on press, and the mouse drag
sensor listens on the same event. A change to pointer, touch, drag or hotkey handling keeps every existing path
working and is checked on each: a mouse click, a touch tap (the touch sensor starts a drag only after the finger moves,
so a still touch stays a tap), and the keyboard alone, including deselecting a card with `Escape`.
