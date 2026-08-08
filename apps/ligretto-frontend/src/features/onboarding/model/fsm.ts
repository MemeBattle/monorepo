import type { FsmContext } from '@fsmoothy/core'
import { t, StateMachine } from '@fsmoothy/core'
import type { GameResults, Player, Card } from '@memebattle/ligretto-shared'
import { CardColors, PlayerStatus, type Game } from '@memebattle/ligretto-shared'

import { OnboardingStep, OnboardingEvent } from './steps'

export { OnboardingStep, OnboardingEvent } from './steps'

export const ONBOARDING_HARDCODED_RESULTS: GameResults = {
  id0: { roundScore: 4, gameScore: 4 },
  id1: { roundScore: -5, gameScore: -5 },
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

/** Playground deck the scripted opponent plays the green sequence into. */
export const OPPONENT_DECK_INDEX = 2

/** Display names of the scripted players: the trainee and the three bots. */
export const ONBOARDING_PLAYER_NAMES: Record<'id0' | 'id1' | 'id2' | 'id3', string> = {
  id0: 'Ты',
  id1: 'Трус',
  id2: 'Балбес',
  id3: 'Бывалый',
}

/** The player's hand deck, face down; cards are flipped onto the open pile in this order. */
const STACK_DECK_CARDS: ReadonlyArray<Card> = [
  { value: 9, color: CardColors.blue },
  { value: 2, color: CardColors.blue },
  { value: 6, color: CardColors.green },
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

/** The player puts the second row card on the playground and the opponent answers with the green one. */
const putSecondCardAndOpponentMove = (ctx: OnboardingContext) => {
  const playerCard = ctx.data.game.players.id0.cards[1]
  if (playerCard) {
    ctx.data.game.playground.decks[1] = { cards: [playerCard], isHidden: false }
    ctx.data.game.players.id0.cards[1] = null
  }
  ctx.data.game.playground.decks[OPPONENT_DECK_INDEX] = {
    cards: [{ value: 1, color: CardColors.green }],
    isHidden: false,
  }
}

/** The player puts the green three from the row on top of the opponent's green two. */
const putGreenThree = (ctx: OnboardingContext) => {
  ctx.data.game.players.id0.cards[2] = null
  ctx.data.game.playground.decks[OPPONENT_DECK_INDEX]?.cards.push({ value: 3, color: CardColors.green })
}

/** Put the top ligretto card into the first free row slot. */
const putLigrettoIntoFreeRowSlot = (ctx: OnboardingContext) => {
  const player = ctx.data.game.players.id0
  const freeSlot = player.cards.findIndex(card => card === null)
  if (freeSlot !== -1) {
    player.cards[freeSlot] = player.ligrettoDeck.cards.splice(0, 1)[0]
  }
}

/** Optional move: while a row slot is free, a ligretto card can be put there. */
const putLigrettoInRowHooks = {
  guard: (ctx: OnboardingContext) => ctx.data.game.players.id0.cards.some(card => card === null),
  onEnter: putLigrettoIntoFreeRowSlot,
}

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
          onEnter(ctx) {
            ctx.data.game.players.id0.cards[0] = null
            if (!ctx.data.game.playground.decks[0]) {
              ctx.data.game.playground.decks[0] = {
                cards: [],
                isHidden: false,
              }
            }
            ctx.data.game.playground.decks[0].cards = [{ value: 1, color: CardColors.blue }]
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
            ctx.data.game.playground.decks[0]?.cards.push({ value: 2, color: CardColors.blue })
          },
        }),
        t(OnboardingStep.RowAvailableCard, OnboardingEvent.PutSecondCard, OnboardingStep.LigrettoAvailableCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.cards[1] = null
            ctx.data.game.playground.decks[0]?.cards.push({ value: 3, color: CardColors.blue })
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
            ctx.data.game.playground.decks[OPPONENT_DECK_INDEX]?.cards.push({ value: 2, color: CardColors.green })
          },
        }),

        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnCycledInfo, cycledInfoHooks),
        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnSecondCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.PutLigretto, OnboardingStep.OpponentTurnSecondCard, putLigrettoInRowHooks),
        t(OnboardingStep.OpponentTurnSecondCard, OnboardingEvent.PutThirdCard, OnboardingStep.FinalLigrettoCard, {
          onEnter: putGreenThree,
        }),
        t(OnboardingStep.OpponentTurnCycledInfo, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnSecondCard, {
          onEnter: reshuffleStackDeck,
        }),
        t(OnboardingStep.OpponentTurnCycledInfo, OnboardingEvent.PutThirdCard, OnboardingStep.FinalLigrettoCard, {
          onEnter: putGreenThree,
        }),

        // The round ends only when the ligretto deck is emptied
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.NextStackCard, OnboardingStep.FinalLigrettoCard, {
          onEnter: flipOrReshuffleStack,
        }),
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.Result, {
          guard: (ctx: OnboardingContext) => ctx.data.game.players.id0.ligrettoDeck.cards.length === 1,
          onEnter(ctx) {
            putLigrettoIntoFreeRowSlot(ctx)
            ctx.data.results = ONBOARDING_HARDCODED_RESULTS
          },
        }),
        t(OnboardingStep.FinalLigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.FinalLigrettoCard, {
          onEnter: putLigrettoIntoFreeRowSlot,
        }),
      ],
    })
  }
}
