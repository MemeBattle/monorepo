import type { FsmContext } from '@fsmoothy/core'
import { t, StateMachine } from '@fsmoothy/core'
import type { GameResults, Player, Card } from '@memebattle/ligretto-shared'
import { CardColors, PlayerStatus, type Game } from '@memebattle/ligretto-shared'

import { OnboardingStep, OnboardingEvent } from './steps'

export { OnboardingStep, OnboardingEvent } from './steps'

/**
 * The scores of the scripted round: +1 for every card put on the table, -2 for every card left in the ligretto deck.
 * The trainee puts six cards and empties the deck, the opponent puts its green one, two and four.
 */
export const ONBOARDING_HARDCODED_RESULTS: GameResults = {
  id0: { roundScore: 6, gameScore: 6 },
  id1: { roundScore: -3, gameScore: -3 },
  id2: { roundScore: -6, gameScore: -6 },
  id3: { roundScore: -6, gameScore: -6 },
}

export type OnboardingGame = {
  players: {
    id0: Player
    id1: Player
    id2: Player
    id3: Player
  }
  playground: {
    decks: Game['playground']['decks']
  }
}

/** Display names of the scripted players: the trainee and the three bots. */
export const ONBOARDING_PLAYER_NAMES: Record<'id0' | 'id1' | 'id2' | 'id3', string> = {
  id0: 'Ты',
  id1: 'Трус',
  id2: 'Балбес',
  id3: 'Бывалый',
}

/**
 * The player's hand deck, face down; cards are flipped onto the open pile in this order. The third card fits no pile
 * the tutorial ever builds (blue up to 3, red 1, green up to 5), so the hand never offers a move the steps refuse.
 */
const STACK_DECK_CARDS: ReadonlyArray<Card> = [
  { value: 9, color: CardColors.blue },
  { value: 2, color: CardColors.blue },
  { value: 7, color: CardColors.red },
]

export const createOnboardingGame = (): OnboardingGame => ({
  players: {
    id0: {
      id: 'id0',
      cards: [
        { value: 1, color: CardColors.blue },
        { value: 3, color: CardColors.blue },
        { value: 3, color: CardColors.green },
      ],
      status: PlayerStatus.InGame,
      ligrettoDeck: {
        isHidden: true,
        cards: [
          { value: 5, color: CardColors.blue },
          { value: 1, color: CardColors.red },
          { value: 5, color: CardColors.green },
          { value: 5, color: CardColors.yellow },
          { value: 6, color: CardColors.yellow },
        ],
      },
      stackOpenDeck: {
        isHidden: true,
        cards: [],
      },
      stackDeck: {
        isHidden: true,
        cards: [...STACK_DECK_CARDS],
      },
      isHost: true,
    },
    id1: {
      id: 'id1',
      cards: [
        { value: 1, color: CardColors.green },
        { value: 5, color: CardColors.blue },
        { value: 6, color: CardColors.yellow },
      ],
      status: PlayerStatus.InGame,
      ligrettoDeck: {
        isHidden: true,
        cards: [
          { value: 1, color: CardColors.blue },
          { value: 2, color: CardColors.blue },
          { value: 3, color: CardColors.blue },
        ],
      },
      stackOpenDeck: {
        isHidden: true,
        cards: [],
      },
      stackDeck: {
        isHidden: true,
        cards: [],
      },
      isHost: false,
    },
    id2: {
      id: 'id2',
      cards: [
        { value: 5, color: CardColors.green },
        { value: 6, color: CardColors.yellow },
        { value: 7, color: CardColors.blue },
      ],
      status: PlayerStatus.InGame,
      ligrettoDeck: {
        isHidden: true,
        cards: [
          { value: 1, color: CardColors.yellow },
          { value: 2, color: CardColors.yellow },
          { value: 3, color: CardColors.yellow },
        ],
      },
      stackOpenDeck: {
        isHidden: true,
        cards: [],
      },
      stackDeck: {
        isHidden: true,
        cards: [],
      },
      isHost: false,
    },
    id3: {
      id: 'id3',
      cards: [
        { value: 4, color: CardColors.red },
        { value: 9, color: CardColors.yellow },
        { value: 10, color: CardColors.blue },
      ],
      status: PlayerStatus.InGame,
      ligrettoDeck: {
        isHidden: true,
        cards: [
          { value: 1, color: CardColors.red },
          { value: 2, color: CardColors.red },
          { value: 3, color: CardColors.red },
        ],
      },
      stackOpenDeck: {
        isHidden: true,
        cards: [],
      },
      stackDeck: {
        isHidden: true,
        cards: [],
      },
      isHost: false,
    },
  },
  playground: {
    decks: [],
  },
})

type OnboardingContext = FsmContext<{
  isCycledInfoShown: boolean
  /** The deck the player opened with the blue one — the blue cards that follow go on it. */
  bluePileIndex: number
  /** The deck the scripted opponent opened with its green one — the first one free when it moved. */
  opponentPileIndex?: number
  game: OnboardingGame
  results?: GameResults
}>

const stackOpenDeck = (ctx: OnboardingContext) => ctx.data.game.players.id0.stackOpenDeck
const stackDeck = (ctx: OnboardingContext) => ctx.data.game.players.id0.stackDeck

/** Flip the top card of the closed hand deck onto the open pile. */
const flipStackCard = (ctx: OnboardingContext) => {
  const [card] = stackDeck(ctx).cards.splice(0, 1)
  if (card) {
    stackOpenDeck(ctx).cards.unshift(card)
  }
}

/**
 * The closed deck is exhausted: the open pile is turned over and becomes the
 * closed deck again, in the original flip order.
 */
const reshuffleStackDeck = (ctx: OnboardingContext) => {
  const open = stackOpenDeck(ctx)
  stackDeck(ctx).cards = [...open.cards].reverse()
  open.cards = []
}

const flipOrReshuffleStack = (ctx: OnboardingContext) => {
  if (stackDeck(ctx).cards.length === 0) {
    reshuffleStackDeck(ctx)
  } else {
    flipStackCard(ctx)
  }
}

/**
 * One-time "stack is exhausted" hint: entered when the closed deck is empty
 * and the hint has not been shown yet.
 */
const cycledInfoHooks = {
  guard: (ctx: OnboardingContext) => stackDeck(ctx).cards.length === 0 && !ctx.data.isCycledInfoShown,
  onLeave: (ctx: OnboardingContext) => {
    ctx.data.isCycledInfoShown = true
  },
}

const PLAYGROUND_DECK_COUNT = 12

/** The player puts the second row card on the playground and the opponent answers with the green one. */
const putSecondCardAndOpponentMove = (ctx: OnboardingContext, playgroundDeckIndex = 1) => {
  const { decks } = ctx.data.game.playground
  const playerCard = ctx.data.game.players.id0.cards[1]
  if (playerCard) {
    decks[playgroundDeckIndex] = { cards: [playerCard], isHidden: false }
    ctx.data.game.players.id0.cards[1] = null
  }
  const opponentPileIndex = Array.from({ length: PLAYGROUND_DECK_COUNT }, (_, index) => index).find(index => !decks[index]?.cards.length)
  if (opponentPileIndex !== undefined) {
    ctx.data.opponentPileIndex = opponentPileIndex
    decks[opponentPileIndex] = { cards: [{ value: 1, color: CardColors.green }], isHidden: false }
  }
}

const opponentPile = (ctx: OnboardingContext) =>
  ctx.data.opponentPileIndex === undefined ? undefined : ctx.data.game.playground.decks[ctx.data.opponentPileIndex]

/** The player puts the green three from the row on top of the opponent's green two, and the opponent answers with the green four. */
const putGreenThreeAndOpponentMove = (ctx: OnboardingContext) => {
  ctx.data.game.players.id0.cards[2] = null
  opponentPile(ctx)?.cards.push({ value: 3, color: CardColors.green }, { value: 4, color: CardColors.green })
}

/** The row slot the green five from the ligretto deck lands in: the one the red one freed. */
const GREEN_FIVE_ROW_SLOT = 1

const isGreenFiveInRow = (ctx: OnboardingContext) => ctx.data.game.players.id0.cards[GREEN_FIVE_ROW_SLOT] !== null

/** The player puts the green five from the row on top of the opponent's green four. */
const putGreenFive = (ctx: OnboardingContext) => {
  const { cards } = ctx.data.game.players.id0
  const card = cards[GREEN_FIVE_ROW_SLOT]
  if (card) {
    opponentPile(ctx)?.cards.push(card)
    cards[GREEN_FIVE_ROW_SLOT] = null
  }
}

const ligrettoCards = (ctx: OnboardingContext) => ctx.data.game.players.id0.ligrettoDeck.cards

const canPutLigrettoIntoRow = (ctx: OnboardingContext) => ligrettoCards(ctx).length > 0 && ctx.data.game.players.id0.cards.some(card => card === null)

/** Put the top ligretto card into the first free row slot. */
const putLigrettoIntoFreeRowSlot = (ctx: OnboardingContext) => {
  const player = ctx.data.game.players.id0
  const freeSlot = player.cards.findIndex(card => card === null)
  if (freeSlot !== -1) {
    player.cards[freeSlot] = player.ligrettoDeck.cards.splice(0, 1)[0]
  }
}

/** Optional move: while a row slot is free, a ligretto card can be put there. The last card ends the round, so it never goes this way. */
const putLigrettoInRowHooks = {
  guard: (ctx: OnboardingContext) => canPutLigrettoIntoRow(ctx) && ligrettoCards(ctx).length > 1,
  onEnter: putLigrettoIntoFreeRowSlot,
}

/** The green three goes to the green five step straight away when an optional move already put the green five into the row. */
const putThirdCardTransitions = (from: OnboardingStep) => [
  t(from, OnboardingEvent.PutThirdCard, OnboardingStep.AdditionalRowCard, {
    guard: isGreenFiveInRow,
    onEnter: putGreenThreeAndOpponentMove,
  }),
  t(from, OnboardingEvent.PutThirdCard, OnboardingStep.AdditionalLigrettoCard, {
    onEnter: putGreenThreeAndOpponentMove,
  }),
]

const ONBOARDING_EVENTS: ReadonlyArray<OnboardingEvent> = Object.values(OnboardingEvent)

/**
 * Events the FSM accepts in its current state, guards included.
 * This is the single source of truth for which moves the UI should enable —
 * the step config only describes presentation.
 */
export const getAllowedEvents = async (fsm: OnboardingStateMachine): Promise<Array<OnboardingEvent>> => {
  const canFire = await Promise.all(ONBOARDING_EVENTS.map(event => fsm.can(event)))
  return ONBOARDING_EVENTS.filter((_, index) => canFire[index])
}

export class OnboardingStateMachine extends StateMachine<OnboardingStep, OnboardingEvent, OnboardingContext> {
  constructor() {
    super({
      initial: OnboardingStep.Opponents,
      data() {
        return {
          isCycledInfoShown: false,
          bluePileIndex: 0,
          game: createOnboardingGame(),
        }
      },
      transitions: [
        // Intro steps: the user just clicks the "next" button
        t(OnboardingStep.Opponents, OnboardingEvent.NextStep, OnboardingStep.Playground),
        t(OnboardingStep.Playground, OnboardingEvent.NextStep, OnboardingStep.Cards),
        t(OnboardingStep.Cards, OnboardingEvent.NextStep, OnboardingStep.Stack),
        t(OnboardingStep.Stack, OnboardingEvent.NextStep, OnboardingStep.Row),
        t(OnboardingStep.Row, OnboardingEvent.NextStep, OnboardingStep.Ligretto),
        t(OnboardingStep.Ligretto, OnboardingEvent.NextStep, OnboardingStep.FirstCard),

        t(OnboardingStep.FirstCard, OnboardingEvent.PutFirstCard, OnboardingStep.LigrettoCard, {
          onEnter(ctx, playgroundDeckIndex = 0) {
            ctx.data.game.players.id0.cards[0] = null
            ctx.data.bluePileIndex = playgroundDeckIndex
            ctx.data.game.playground.decks[playgroundDeckIndex] = { cards: [{ value: 1, color: CardColors.blue }], isHidden: false }
          },
        }),
        t(OnboardingStep.LigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.StackCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.ligrettoDeck.cards.splice(0, 1)
            ctx.data.game.players.id0.cards[0] = { value: 4, color: CardColors.red }
          },
        }),
        t(OnboardingStep.StackCard, OnboardingEvent.NextStackCard, OnboardingStep.StackUnavailableCard, {
          onEnter: flipStackCard,
        }),
        t(OnboardingStep.StackUnavailableCard, OnboardingEvent.NextStackCard, OnboardingStep.StackAvailableCard, {
          onEnter: flipStackCard,
        }),
        t(OnboardingStep.StackAvailableCard, OnboardingEvent.PutStackCard, OnboardingStep.RowAvailableCard, {
          onEnter(ctx) {
            stackOpenDeck(ctx).cards.splice(0, 1)
            ctx.data.game.playground.decks[ctx.data.bluePileIndex]?.cards.push({ value: 2, color: CardColors.blue })
          },
        }),
        t(OnboardingStep.RowAvailableCard, OnboardingEvent.PutSecondCard, OnboardingStep.LigrettoAvailableCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.cards[1] = null
            ctx.data.game.playground.decks[ctx.data.bluePileIndex]?.cards.push({ value: 3, color: CardColors.blue })
          },
        }),
        t(OnboardingStep.LigrettoAvailableCard, OnboardingEvent.PutLigretto, OnboardingStep.GameStarted, {
          onEnter(ctx) {
            ctx.data.game.players.id0.cards[1] = ctx.data.game.players.id0.ligrettoDeck.cards.splice(0, 1)[0]
          },
        }),

        t(OnboardingStep.GameStarted, OnboardingEvent.NextStackCard, OnboardingStep.GameStartedCycledInfo, cycledInfoHooks),
        t(OnboardingStep.GameStarted, OnboardingEvent.NextStackCard, OnboardingStep.GameStarted, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.GameStarted, OnboardingEvent.PutSecondCard, OnboardingStep.OpponentTurn, {
          onEnter: putSecondCardAndOpponentMove,
        }),
        t(OnboardingStep.GameStartedCycledInfo, OnboardingEvent.NextStackCard, OnboardingStep.GameStarted, {
          onEnter: reshuffleStackDeck,
        }),
        t(OnboardingStep.GameStartedCycledInfo, OnboardingEvent.PutSecondCard, OnboardingStep.OpponentTurn, {
          onEnter: putSecondCardAndOpponentMove,
        }),

        t(OnboardingStep.OpponentTurn, OnboardingEvent.PutLigretto, OnboardingStep.OpponentTurn, putLigrettoInRowHooks),

        // The opponent answers with the green two as soon as the player flips the stack in hand
        t(OnboardingStep.OpponentTurn, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnSecondCard, {
          onEnter(ctx) {
            flipOrReshuffleStack(ctx)
            opponentPile(ctx)?.cards.push({ value: 2, color: CardColors.green })
          },
        }),

        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnCycledInfo, cycledInfoHooks),
        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnSecondCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.PutLigretto, OnboardingStep.OpponentTurnSecondCard, putLigrettoInRowHooks),
        ...putThirdCardTransitions(OnboardingStep.OpponentTurnSecondCard),
        t(OnboardingStep.OpponentTurnCycledInfo, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnSecondCard, {
          onEnter: reshuffleStackDeck,
        }),
        ...putThirdCardTransitions(OnboardingStep.OpponentTurnCycledInfo),

        // The green five from the ligretto deck goes into the row and from there onto the opponent's green four
        t(OnboardingStep.AdditionalLigrettoCard, OnboardingEvent.NextStackCard, OnboardingStep.AdditionalLigrettoCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.AdditionalLigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.AdditionalRowCard, {
          guard: canPutLigrettoIntoRow,
          onEnter: putLigrettoIntoFreeRowSlot,
        }),
        t(OnboardingStep.AdditionalRowCard, OnboardingEvent.NextStackCard, OnboardingStep.AdditionalRowCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.AdditionalRowCard, OnboardingEvent.PutLigretto, OnboardingStep.AdditionalRowCard, putLigrettoInRowHooks),
        t(OnboardingStep.AdditionalRowCard, OnboardingEvent.PutSecondCard, OnboardingStep.FinalLigrettoCard, {
          guard: isGreenFiveInRow,
          onEnter: putGreenFive,
        }),

        // The round ends only when the ligretto deck is emptied
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.NextStackCard, OnboardingStep.FinalLigrettoCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.RoundEnd, {
          guard: (ctx: OnboardingContext) => canPutLigrettoIntoRow(ctx) && ligrettoCards(ctx).length === 1,
          onEnter(ctx) {
            putLigrettoIntoFreeRowSlot(ctx)
            ctx.data.results = ONBOARDING_HARDCODED_RESULTS
          },
        }),
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.FinalLigrettoCard, putLigrettoInRowHooks),
        // The board stays as the round left it until the player moves on to the results
        t(OnboardingStep.RoundEnd, OnboardingEvent.NextStep, OnboardingStep.Result),
      ],
    })
  }
}
