# Code review — `docs/issue-685-drag-drop-plan`

Scope: the uncommitted working tree on top of `HEAD` (`4930f77f`, fast-forwarded to `origin/master`) — 40 modified /
deleted files plus the untracked `cardInteraction` feature, `PlaygroundDeck`, `OnboardingPlayground`,
`cardByOnboardingTarget`, `PlayerStackOpenDeck` and `ligretto-shared/cardPlacement.ts`.

Verification run:

- `pnpm lint:check` — clean. `pnpm fmt:check` — clean.
- `pnpm ts-check` — every package touched by this change is clean; `apps/blog` fails on generated
  `.next/types/validator.ts` (untouched by this branch, see "Unrelated").
- `ligretto-gameplay-backend` tests — 75/75 green.
- `ligretto-frontend` tests — **2 failed** / 63 passed (see #1).

## Findings

### 1. The Ligretto hotkey fires when the deck is empty or not rendered — `apps/ligretto-frontend/src/features/player/ui/LigrettoDeckContainer.tsx:19`

The `isLigrettoDeckEnabled` guard was dropped, so `L` is registered unconditionally, and it is registered
_before_ the `if (!ligrettoDeckCards) return null` early return, so it also fires while the deck is not on
screen. The badge shows `L` on an empty deck too. `cardOwnedHotkeys.spec.tsx` still asserts the old
behaviour and fails:

- `does not handle L when the Ligretto deck is empty` — the `L` badge is rendered (`:221`).
- `dispatches the Ligretto command exactly once from L only while mounted and enabled` — `L` dispatches after
  `ligrettoDeckCards` becomes `undefined` (`:244`).

`PlayerStackDeck.tsx:34` has the same shape for Space (hook before the `!stackDeckCards` early return), but
there the spec was deliberately rewritten to "dispatches Space … even when both stack decks are empty", so the
two commands now disagree on the rule.

**Plan.** Pick one rule for both commands and make code and specs agree.

1. Recommended: restore the guard — `useCardHotkey(ligrettoDeckCards?.length ? Hotkey.l : undefined, …)` and
   `hotkey={ligrettoDeckCards.length ? Hotkey.l : undefined}` on the pack. That keeps both existing specs.
2. For Space, gate on `stackDeckCards?.length || stackOpenDeckCards?.length` the same way (which also covers
   the not-rendered case), and revert the spec to "does not handle Space when both decks are empty".
3. If "always dispatch, let the server ignore it" is the intended rule instead, still pass `undefined` when
   the deck is not rendered, and update the two Ligretto specs explicitly.

### 2. The optimistic move is undone by any intervening server update — `apps/ligretto-frontend/src/ducks/game/slice.ts:81`

`putCardOptimisticallyAction` / `putCardFromStackOpenDeckOptimisticallyAction` mutate the store, and
`updateGameAction` (`slice.ts:66`) replaces `state.game` wholesale. Any `updateGameAction` produced by another
player's move that the server emitted before it processed ours arrives after our optimistic write and reverts
it: the card jumps back into the row / open stack and onto the deck again when our own echo arrives — the same
flash the optimistic update was introduced to remove, just rarer and in exactly the busy moments of a round.

Secondary effect: during that window the card is back in its slot and can be placed again. The server
only receives `cardIndex`, so if slot refill has already happened server-side the second command refers to a
different card than the one the player sees. Low probability, but it is the kind of desync that is hard to
reproduce later.

**Plan.**

1. Keep a small `pendingPlacements` list in the game slice (source + card + deck index + a sequence number)
   instead of writing straight into `game`.
2. In `updateGameAction`, apply the server state, then drop every pending placement the server state already
   reflects (source slot no longer holds that card) and re-apply the rest with `placeCardOnDeck`; drop anything
   that no longer validates.
3. Expire a pending placement after one confirmed echo for our own command or a short timeout, so a rejected
   move snaps back instead of lingering.
4. Unit-test the reducer with the sequence optimistic → foreign `updateGame` → own `updateGame`.

If that is too much for this PR, document the limitation in the feature README and in the listener comment in
`ducks/game/listeners.ts`, which currently claims the move "can be mirrored locally before the server confirms
it" without mentioning the revert.

### 3. Gameplay change worth an explicit sign-off — one-tap placement of a 1 is gone

Frontend and backend both drop the "tap a 1 and it goes to the first free deck" path (`findAvailableDeckIndex`,
optional `playgroundDeckIndex` in the DTO). Every 1 now costs two actions or a drag. In a speed game that is a
noticeable change for the most frequent opening move. It is coherent with the new model, the specs were
updated on purpose, and old clients degrade safely (`checkIsDeckAvailable` rejects a missing index) — just make
sure this is a product decision for issue 685 and mention it in the PR description.

## Resolved

- Onboarding placements follow the rules the tutorial teaches. `pages/onboarding/onboardingPlacement.ts` names
  the card each step moves, and `canPlaceCardOnDeck` decides where it may go, with no reserved decks. The
  scripted opponent opens its green pile on the first deck still free when it moves (`opponentPileIndex` in the
  FSM and the onboarding state), and the hint arrow follows it. The placement actions carry
  `playgroundDeckIndex` into the FSM. The FSM opens the blue pile (and the red 1) on the deck the player picked,
  remembers it as `bluePileIndex`, and puts the next blue cards on it. When no deck index is passed, it falls back
  to the scripted decks, so the script replays in unit tests and Storybook are unchanged. Every legal deck is
  highlighted, with a stronger glow. Onboarding cards are draggable through `useDraggableCard` /
  `useDroppableTarget`, like in the game. `data-card-interaction-element` sits on the deck places rather than on
  `TableCards`. The e2e opens the blue pile on deck 5, checks that all 12 decks are highlighted for the first 1, and
  drags the red 1 (onto the blue pile first, which is rejected, then onto a free deck).
- Dead duplicate `PlayerStackOpenCard.tsx` removed (`PlayerStackOpenDeck.tsx` is the one in use), together with
  the unused `CardDragData` / `CardDropTarget` exports of `#features/cardInteraction`.
- `features/cardInteraction/README.md` removed, so its stale claims (`inert`, `placeCardOptimisticallyAction`)
  are gone with it.
- Nits: `OnboardingPlayground` renders `CardPlace` directly (new `isHighlighted` prop) instead of a
  re-sized `DeckSurface`, and is clickable only while a card is picked; the no-op `useMemo`s in
  `useDraggableCard` / `useDroppableTarget` are dropped. The onboarding page object clicks the place itself.

## Checked and fine

- Items from the previous review are resolved: the injectable card selector is gone and `cardInteraction` no
  longer reads card values; repeated hotkeys toggle off and Escape clears a focused card; activation is back on
  mousedown and chained with the dnd-kit listener; the catalog entry is in order; the gameplay playground no
  longer highlights valid decks; a successful placement is mirrored optimistically (modulo #3).
- `canPlaceCardOnDeck` is shared by backend, reducer and UI and keeps the `undefined` (no such deck) vs `null`
  (empty deck) distinction; `checkIsDeckAvailable` rejects non-integer / out-of-range indices.
- `PlaygroundDeck.placeCard` re-reads the source card from the store and compares it with the dragged card, so a
  drop of a card that changed mid-gesture is ignored.
- `DndLifecycle` only calls `onDrop` when both source and destination nodes are still connected and the
  provider is enabled; `dragTerminal` is keyed by `sourceId`, so a late cancel cannot clobber a newer state.
- `useCardInteraction`'s cleanup clears the selection when the card at a target changes or unmounts, which also
  covers the optimistic removal of the placed card.
- `currentUserIdSelector` is the same key `playerSelector` uses, so the optimistic reducers touch the right
  player.
- No stale references remain to `cardFocus`, `PlaygroundContainer`, `tapCardAction`,
  `tapStackOpenDeckCardAction`, `useCardHotkey` in `features/player/lib`, or the deleted plan docs.

## Unrelated

`pnpm ts-check` fails in `apps/blog` on the Next-generated `.next/types/validator.ts` (`/[locale]/feed` route
params typed as `'en' | 'ru'`). No blog file is touched by this change.
