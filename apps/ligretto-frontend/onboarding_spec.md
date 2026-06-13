# Ligretto Onboarding — Specification

This document describes how the onboarding flow must work on the `/onboarding`
route. It is the source of truth for finishing the partially-implemented
onboarding feature.

The original short brief is preserved in `apps/ligretto-frontend/onboarding_spec`
(Russian). This file is the canonical, expanded version (English).

---

## 1. Goals

- Teach new players the rules of Ligretto and the in-game controls.
- Run on its own route `/onboarding`, fully isolated from a real game session.
- All game logic and transitions are driven by a finite-state machine
  (`features/onboarding/model/fsm.ts`).
- Focus the user's attention on the right UI element on every step using a
  layered overlay system.

## 2. Architecture

| Concern | Location |
|---|---|
| Route | `routes.ONBOARDING` (`/onboarding`) |
| Page | `apps/ligretto-frontend/src/pages/onboarding/OnboardingPage.tsx` |
| FSM | `apps/ligretto-frontend/src/features/onboarding/model/fsm.ts` |
| Redux slice | `apps/ligretto-frontend/src/features/onboarding/model/slice.ts` |
| Listeners | `apps/ligretto-frontend/src/features/onboarding/model/listeners.ts` |
| Layers (z-index over overlay) | `pages/onboarding/Layer.tsx` |
| Description bubbles | `pages/onboarding/descriptions/*.tsx` |
| Arrows | `shared/ui/OnboardingArrow` |
| Outline highlight | `shared/ui/OnboardingOutline` |
| Backdrop overlay | `shared/ui/Overlay` (blur + dim) |
| Final screen | `pages/onboarding/ResultScreen.tsx` |

Flow:

1. A redux listener (`features/onboarding/model/listeners.ts`) catches the
   route entry, instantiates an `OnboardingStateMachine`, and pushes its
   `current` step and `game` data into the slice via `setOnboardingState`.
2. Every UI dispatch (Next button click, card click, ligretto click, etc.)
   maps to an `OnboardingEvent`; the listener forwards it to
   `fsm.tryTransition` and the resulting state is mirrored back into redux.
3. The page reacts to `onboardingStepSelector` to decide which descriptions,
   arrows, highlights and layers to render.

## 3. FSM constants

```
OnboardingStep:
  Opponents, Playground, Cards, Stack, Row, Ligretto,
  FirstCard, LigrettoCard,
  StackCard, StackUnavailableCard, StackAvailableCard,
  RowAvailableCard, LigrettoAvailableCard,
  GameStarted, GameStartedCycledInfo,
  OpponentTurn, OpponentTurnCycledInfo,
  Result

OnboardingEvent:
  NextStep, NextStackCard, PutStackCard,
  PutFirstCard, PutSecondCard, PutLigretto
  (PutThirdCard is deprecated — see §6)
```

## 4. Initial game state

Set inside the FSM context (see `fsm.ts`). Mirrored into the slice on route
entry.

- `players.id0` (the learner, host)
  - `cards` (row): `[blue 1, blue 3, green 3]`
  - `ligrettoDeck.cards`: `[blue 5, red 1, yellow 5]` (**3 cards**)
  - `stackOpenDeck.cards`: `[]`
  - `stackDeck.cards`: `[]`
- `players.id1`, `id2`, `id3` (opponents)
  - `cards`: 3 face-down cards each (values irrelevant — hand is hidden)
  - `ligrettoDeck.cards`: **3 cards each** (must match the player; values
    irrelevant — hidden from the user).
  - `stackOpenDeck`, `stackDeck`: empty.
- `playground.decks`: `[]`.

The opponent ligretto deck count is what scoring depends on at the end. It
**must equal the player's starting size (3)**, even though the cards are not
shown to the user.

## 5. Steps

Legend:
- "Highlight" = visually emphasised element (border / outline / `isHighlighted`).
- "Arrow from X to Y" = `OnboardingArrow` from the description bubble to the
  target ref.
- "Visible above overlay" = the listed `LayerId`s are raised above the blur
  overlay; everything else stays dimmed.

The overlay (blur + dim) is **active on steps 1–13**, and **hidden from step
14 onwards** (`GameStarted`, `OpponentTurn`, `OpponentTurnCycledInfo`,
`Result` — the game scene is fully visible from that point on).

### Step 1 — `Opponents`
- Visible above overlay: `opponent`.
- Description (centered): "Это твои соперники".
- Arrows from the bubble to each of the three opponents.
- Advance: "Next" button → `NextStep` → `Playground`.

### Step 2 — `Playground`
- Visible above overlay: `playgroundCards` (the empty table).
- Description: "Это общий стол. Сюда будем выкладывать карты".
- Arrow from the bubble to the playground; the bubble must not overlap the
  table area.
- Advance: "Next" → `NextStep` → `Cards`.

### Step 3 — `Cards`
- Visible above overlay: `playerCards` (whole bottom panel: stack, row,
  ligretto).
- Description: "Это твои карты".
- Arrows from the bubble to: the closed stack deck, the cards row, the
  ligretto pack.
- Hand stack and ligretto are still "face-down" (closed). Row shows
  `[blue 1, blue 3, green 3]`.
- Advance: "Next" → `NextStep` → `Stack`.

### Step 4 — `Stack`
- Visible above overlay: `playerCards`.
- Description: "Это твои карты в руке".
- Arrow to the closed stack deck; stack deck has an outline highlight.
- Advance: "Next" → `NextStep` → `Row`.

### Step 5 — `Row`
- Visible above overlay: `playerCards`.
- Description: "Это твои карты в ряду".
- Arrow to the row; the row is outlined.
- Advance: "Next" → `NextStep` → `Ligretto`.

### Step 6 — `Ligretto`
- Visible above overlay: `playerCards`.
- Description: "Это твоя колода ligretto".
- Arrow to the ligretto pack (highlighted).
- Advance: "Next" → `NextStep` → `FirstCard`.

### Step 7 — `FirstCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "На свободное место на столе можно выкладывать единицу
  любого цвета. Давай выложим первую карту!"
- `cards[0]` (blue 1) is highlighted; arrow points to it.
- Advance: click `cards[0]` → `PutFirstCard` → `LigrettoCard`.
  - State change: `cards[0] = null`; `playground.decks[0] = { cards: [blue 1], isHidden: false }`.

### Step 8 — `LigrettoCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "Карты из колоды ligretto нужно выкладывать на свободное
  место в ряду. Раунд закончится, как только первый из игроков выложит все
  карты из колоды ligretto."
- Ligretto pack highlighted; arrow points to it.
- Advance: click ligretto → `PutLigretto` → `StackCard`.
  - State change: `ligrettoDeck.cards.shift()` (removes `blue 5`);
    `cards[0] = { value: 4, color: red }`.

### Step 9 — `StackCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "Если из ряда выложить нечего, воспользуйся колодой в руке".
- Stack deck highlighted; arrow points to it.
- Advance: click stack deck → `NextStackCard` → `StackUnavailableCard`.
  - State change: `stackOpenDeck.cards = [blue 9, blue 2, green 6]`.

### Step 10 — `StackUnavailableCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "Выкладывать на стол можно только карту того же цвета
  следующую по номиналу (или единицу на свободное место). Давай искать
  подходящую карту в руке дальше".
- Arrow to the stack deck.
- Advance: click stack deck → `NextStackCard` → `StackAvailableCard`.
  - State change: `stackOpenDeck.cards.shift()` → `[blue 2, green 6]`.

### Step 11 — `StackAvailableCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "Скорее выкладывай карту на стол!"
- Top card of `stackOpenDeck` highlighted; arrow points to it.
- Advance: click the top open-stack card → `PutStackCard` → `RowAvailableCard`.
  - State change: `stackOpenDeck.cards.shift()` → `[green 6]`;
    `playground.decks[0].cards.push(blue 2)`.

### Step 12 — `RowAvailableCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "У тебя есть подходящая карта в ряду".
- `cards[1]` (blue 3) highlighted; arrow points to it.
- Advance: click `cards[1]` → `PutSecondCard` → `LigrettoAvailableCard`.
  - State change: `cards[1] = null`;
    `playground.decks[0].cards.push(blue 3)`.

### Step 13 — `LigrettoAvailableCard`
- Visible above overlay: `playerCards`, `playgroundCards`.
- Description: "Освободилось место в ряду. Выкладывай из колоды ligretto".
- Ligretto pack highlighted; arrow points to it.
- Advance: click ligretto → `PutLigretto` → `GameStarted`.
  - State change: `cards[1] = ligrettoDeck.cards.shift()` (= `red 1`).

### Step 14 — `GameStarted`
- Overlay is hidden from this step onwards.
- No description text shown.
- `cards[1]` (red 1) highlighted.
- Advance: click `cards[1]` (the red 1) → `PutSecondCard` → `OpponentTurn`.
  - State change:
    - `playground.decks[1] = { cards: [red 1], isHidden: false }` (a new
      pile — red 1 must not stack on the blue pile).
    - `cards[1] = null`.
    - Opponent move: `playground.decks[2] = { cards: [green 1], isHidden: false }`.

#### 14a — `GameStartedCycledInfo` (technical, optional)
- Reached only if `stackOpenDeck` empties and `isCycledInfoShown` is false.
- Description (centered): "Карты в стеке закончились — они перелистаются
  заново".
- In the canonical scripted scenario this branch is **not** entered.

### Step 15 — `OpponentTurn`
- Description: "Соперник выложил карту на стол".
- Arrow from the bubble to the newest opponent pile (`playground.decks[2]`,
  the green 1).
- Ligretto pack highlighted.
- After the transition from step 14, the playground shows three top cards:
  blue 3 (top of `decks[0]`), red 1 (`decks[1]`), green 1 (`decks[2]`).
- Advance: click ligretto → `PutLigretto` → `Result`.

#### 15a — `OpponentTurnCycledInfo` (technical, optional)
- Same conditional info screen as 14a, for the opponent-turn branch. Not
  part of the scripted scenario.

### Step 16 — `Result`
- A modal opens. Backdrop dim.
- Modal title: "Раунд 1. Результаты".
- Body: a scores table (same shape as the in-game scores table).
- Description bubble (outside the modal) with an arrow to the modal:
  "Поздравляем! Ты победил! За каждую выложенную карту на общий стол,
  игрок получает +1 очко. На конец раунда из суммы заработанных очков
  вычитается количество карт, оставшихся в колоде ligretto умноженное на 2."
- Button "Закончить обучение" → `navigate(routes.HOME)`.

## 6. FSM transitions to fix

The current `fsm.ts` has two deviations from this spec that must be
corrected:

1. `GameStarted → OpponentTurn` (event `PutSecondCard`):
   - Today: pushes `cards[1]` into `decks[0]` and adds `{ value: 4, blue }`
     into `decks[1]`.
   - Required: push red 1 into a **new** pile `decks[1]`, then add
     `{ value: 1, green }` into another new pile `decks[2]`.
2. `OpponentTurn → Result`:
   - Today: triggered by `PutThirdCard`.
   - Required: triggered by `PutLigretto` (click on the ligretto pack).
   - Consequence: `PutThirdCard` / `putThirdCardAction` are unused and must
     be removed.

## 7. Scoring (hardcoded at `Result`)

Formula (informational, shown in the bubble):
`score = cardsOnTable - 2 * ligrettoRemaining`

For this scripted scenario the scores are **hardcoded** when entering
`Result`:

| Player | Cards on table | Ligretto left | Score |
|---|---|---|---|
| id0 (you) | 4 | 0 (treated as 0 for the scripted ending) | **4** |
| id1 (played green 1) | 1 | 3 | **-5** |
| id2 | 0 | 3 | **-6** |
| id3 | 0 | 3 | **-6** |

All opponents start the round with the **same ligretto deck size as the
player (3)**, even though their decks are hidden from the user. This is
required so the score formula yields the values above.

The hardcoded scores live in the slice/FSM `onEnter` for `Result` (or
directly in the modal's data source). No real recalculation is needed.

## 8. Layers and overlay

`pages/onboarding/Layer.tsx` raises specific blocks above the blur overlay.

| `LayerId` | Raised on steps |
|---|---|
| `opponent` | `Opponents`, `GameStarted`, `OpponentTurn`, `OpponentTurnCycledInfo`, `Result` |
| `playgroundCards` | `Playground`, `FirstCard`, `LigrettoCard`, `StackCard`, `StackUnavailableCard`, `StackAvailableCard`, `RowAvailableCard`, `LigrettoAvailableCard`, `GameStarted`, `GameStartedCycledInfo`, `OpponentTurn`, `OpponentTurnCycledInfo` |
| `playerCards` | `Cards`, `Stack`, `Row`, `Ligretto`, `FirstCard`, `LigrettoCard`, `StackCard`, `StackUnavailableCard`, `StackAvailableCard`, `RowAvailableCard`, `LigrettoAvailableCard`, `GameStarted`, `GameStartedCycledInfo`, `OpponentTurn`, `OpponentTurnCycledInfo` |

The blur overlay (`Overlay`) is rendered on steps **1–13** only. Starting
with `GameStarted` (step 14) it is hidden — the game scene is fully
visible.

## 9. Highlights and outlines

| Step | Highlighted element |
|---|---|
| `Stack` | stack deck (outline) |
| `Row` | cards row (outline) |
| `Ligretto` | ligretto pack (`isHighlighted`) |
| `FirstCard` | `cards[0]` |
| `LigrettoCard` | ligretto pack |
| `StackCard`, `StackUnavailableCard` | stack deck |
| `StackAvailableCard` | top card of `stackOpenDeck` |
| `RowAvailableCard` | `cards[1]` |
| `LigrettoAvailableCard` | ligretto pack |
| `GameStarted` | `cards[1]` (red 1) |
| `OpponentTurn` | ligretto pack |

## 10. "Next" button

The "Next" button (top-right corner, with `TouchHint` after a delay) is
shown on the intro-style steps only:

`Opponents`, `Playground`, `Cards`, `Stack`, `Row`, `Ligretto`.

On every other step the user advances by interacting with a specific UI
element (a card, the stack deck, or the ligretto pack).

## 11. Card clickability rules (per step)

The row/stack/ligretto click handlers are only "live" when they advance the
flow:

| Step | Clickable element(s) |
|---|---|
| `FirstCard` | `cards[0]` |
| `LigrettoCard` | ligretto pack |
| `StackCard`, `StackUnavailableCard` | stack deck (closed) |
| `StackAvailableCard` | top card of `stackOpenDeck` |
| `RowAvailableCard` | `cards[1]` |
| `LigrettoAvailableCard` | ligretto pack |
| `GameStarted` | `cards[1]` (red 1) |
| `OpponentTurn` | ligretto pack |
| `Result` | "Закончить обучение" button |

Any other interaction must be a no-op (e.g. `cards[2]` is never clicked in
the scripted scenario).

## 12. Exit

`Закончить обучение` navigates to `routes.HOME`. The route listener tears
down the FSM when leaving `/onboarding`.

## 13. Done-when checklist

- All step texts match this document verbatim.
- The "Next" button is shown only on steps 1–6.
- The overlay is hidden starting from `GameStarted`.
- Opponents are visible (raised) on steps 14, 15 and `Result`.
- The red 1 played by the player at step 14 creates a new playground pile.
- The opponent at step 15 plays a green 1 into a new playground pile.
- Clicking the ligretto pack at step 15 advances to `Result`.
- The `Result` modal title is "Раунд 1. Результаты", contains a scores
  table with `id0=4, id1=-5, id2=-6, id3=-6`, and a "Закончить обучение"
  button.
- No unused actions/events remain (`PutThirdCard` removed).
