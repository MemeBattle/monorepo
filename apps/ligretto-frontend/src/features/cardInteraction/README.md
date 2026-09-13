# Card interaction ownership

`CardInteractionProvider` owns an explicit `idle | focused | dragging` reducer,
standard dnd-kit mouse/touch sensors and outside-click dismissal. Provider
enablement makes descendants natively `inert`; internal hooks also guard
selection, hotkeys and native drag/drop registration and delivery. Consumers do
not receive global enabled props. There is no event capture interceptor,
enablement ref or command runner. The provider does not select Redux data,
validate game rules, dispatch game commands or render cards.

Components opt into behavior through hooks:

- `useCardInteraction(target)` selects the relevant card internally. Changes to
  its color/value or target identity, and unmount, clear only that target.
  Equivalent Redux objects and unrelated updates preserve selection.
  The argument-free overload exposes the current target and explicit clearing.
- `cardByInteractionTarget(state, target)` belongs to this feature and resolves
  row, open-stack and playground cards. The drag overlay reuses it.
- `useDraggableCard(target, card)` attaches the native source to the owner's
  element. Mounted consumers are available whenever their provider is enabled;
  there is no consumer disabled argument. Card identity changes and unmount
  remove the old source registration. Selection cleanup belongs only to
  `useCardInteraction`; provider disablement clears selection centrally.
  Components own source visibility/styles.
- `useDroppableTarget(target, onDrop)` selects the source and destination and
  returns `isValid`, `isOver`, `id` and `setNodeRef`. Validity follows the
  native dragged source during a gesture, independently of hotkey selection.
  Delivery reads the live Redux source and destination again, checks card
  identity and placement validity, then invokes the owner's command through dnd
  data. The provider requires connected, registered source and destination nodes.
- `useCardHotkey(key, callback)` clears selection before invoking its owner.
  It returns nothing. Pointer handlers invoke their own callbacks directly;
  document clicks own dismissal. Repeated row/open-stack shortcuts keep that
  card selected, while repeated pointer activation toggles selection.
- `useCardDragTarget()` derives the live registered drag target independently of
  selection. `PlayerCardDragOverlay` owns the overlay and card rendering.

`Playground` selects its decks directly. `PlaygroundDeck` owns presentation and
explicit placement commands; its hook owns drag validity. The closed stack's
Space shortcut and click command remain available even when both stack decks
are empty.

## Gesture and command semantics

Hotkeys remain available during pending and active mouse/touch gestures.
They neither cancel native dragging nor prevent a valid drop on release.
Source visibility and the overlay follow the native gesture, not selection.
There are no custom sensors, Escape interception or release-click guards.
Standard dnd-kit terminal events synchronize reducer state.

Mouse dragging activates after movement exceeds 6 px; touch dragging after
movement exceeds 8 px. Holding a stationary finger does not start a drag, so
its eventual tap can toggle selection without a time limit. Sources use
`touchAction: 'none'` to avoid a competing scroll gesture.

Card activation currently uses `onClick`, not the historical `onMouseDown`
speed-game behavior introduced in LIG-144 (`8c6e400b`). This separates activation
from native drag initiation but waits for release, including on non-draggable
stack, Ligretto and onboarding cards. Press-drag-off-release no longer activates
those controls. On a draggable source, movement past the mouse threshold followed
by release over the source is a cancelled placement, not a selection: dnd-kit
suppresses the subsequent click. These are usability trade-offs, not equivalent
input behavior; retaining them versus restoring press activation needs review.

Click placement prevalidates with the hook's `isValid`, as drag/drop does, but
still keeps its selected source until a server-confirmed identity update.
Backend validation remains authoritative. This retained selection allows a
second click before the server echo to submit the same source again; clearing
on accepted dispatch versus retaining focus with an in-flight guard needs a
product decision because prior review assigned click dismissal to the document.
Do not auto-place value-1 source cards.

## Onboarding isolation

Onboarding keeps its dedicated playground, callback routing and outline refs.
Its provider supplies `cardByOnboardingTarget` through `cardByTargetSelector`,
so hook-owned identity lookup uses tutorial Redux data and allowed events.
An unavailable tutorial source resolves to no card, clearing its selection when
the step changes. Gameplay card updates cannot affect tutorial selection.
The provider only carries the selector; hooks execute it.

## Tests

Selection and drop tests use Redux stores and real dnd-kit mouse/touch events.
Rendered gameplay tests assert exact action counts/payloads, live source and
destination updates, overlay/source visibility, shortcut availability and
onboarding permission changes. Provider/hotkey-only tests need no Redux store.
jsdom does not implement native inert hit testing; disabled pointer/focus
behavior requires a browser check. MouseSensor suppresses document clicks for
50 ms after release, so tests mixing drag and click allow teardown to finish.
No new DnD E2E harness is required.
