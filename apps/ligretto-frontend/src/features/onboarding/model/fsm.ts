import type { FsmContext } from '@fsmoothy/core'
import { t, StateMachine } from '@fsmoothy/core'
import type { Player } from '@memebattle/ligretto-shared'
import { CardColors, PlayerStatus, type Card, type Game } from '@memebattle/ligretto-shared'

export enum OnboardingStep {
  Opponents = 'opponents',
  Playground = 'playground',
  Cards = 'cards',
  Stack = 'stack',
  Row = 'row',
  Ligretto = 'ligretto',
  FirstCard = 'firstCard',
  LigrettoCard = 'ligrettoCard',
  StackCard = 'stackCard',
  StackUnavailableCard = 'stackUnavailableCard',
  StackAvailableCard = 'stackAvailableCard',
  RowAvailableCard = 'rowAvailableCard',
  LigrettoAvailableCard = 'ligrettoAvailableCard',
  GameStarted = 'gameStarted',
  GameStartedCycledInfo = 'gameStartedCycledInfo',
  OpponentTurn = 'opponentTurn',
  OpponentTurnCycledInfo = 'opponentTurnCycledInfo',
  Result = 'result',
}

export enum OnboardingEvent {
  NextStep = 'nextStep',
  NextStackCard = 'nextStackCard',
  PutStackCard = 'putStackCard',
  PutFirstCard = 'putFirstCard',
  PutSecondCard = 'putSecondCard',
  PutThirdCard = 'putThirdCard',
  PutLigretto = 'putLigretto',
}

type OnboardingContext = FsmContext<{
  stack: Array<Card>
  isCycledInfoShown: boolean
  game: {
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
}>

const cycledInfoHooks = {
  guard: (ctx: OnboardingContext) => ctx.data.stack.length === 0 && !ctx.data.isCycledInfoShown,
  onLeave: (ctx: OnboardingContext) => {
    ctx.data.isCycledInfoShown = true
  },
}

export class OnboardingStateMachine extends StateMachine<OnboardingStep, OnboardingEvent, OnboardingContext> {
  constructor() {
    super({
      initial: OnboardingStep.Opponents,
      data() {
        return {
          stack: [],
          isCycledInfoShown: false,
          game: {
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
                isHost: true,
              },
              id1: {
                id: 'id1',
                cards: [
                  { value: 5, color: CardColors.blue },
                  { value: 5, color: CardColors.blue },
                  { value: 5, color: CardColors.blue },
                ],
                status: PlayerStatus.InGame,
                ligrettoDeck: {
                  isHidden: true,
                  cards: [],
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
                  { value: 5, color: CardColors.yellow },
                  { value: 5, color: CardColors.yellow },
                  { value: 5, color: CardColors.yellow },
                ],
                status: PlayerStatus.InGame,
                ligrettoDeck: {
                  isHidden: true,
                  cards: [],
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
                  { value: 5, color: CardColors.red },
                  { value: 5, color: CardColors.red },
                  { value: 5, color: CardColors.red },
                ],
                status: PlayerStatus.InGame,
                ligrettoDeck: {
                  isHidden: true,
                  cards: [],
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
          },
        }
      },
      transitions: [
        // просто кликаем на далее
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
          onEnter(ctx) {
            ctx.data.game.players.id0.stackOpenDeck.cards = [
              { value: 9, color: CardColors.blue },
              { value: 2, color: CardColors.blue },
              { value: 6, color: CardColors.green },
            ]
          },
        }),
        t(OnboardingStep.StackUnavailableCard, OnboardingEvent.NextStackCard, OnboardingStep.StackAvailableCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.stackOpenDeck.cards.splice(0, 1)
          },
        }),
        t(OnboardingStep.StackAvailableCard, OnboardingEvent.PutStackCard, OnboardingStep.RowAvailableCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.stackOpenDeck.cards.splice(0, 1)
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
        t(OnboardingStep.GameStarted, OnboardingEvent.NextStackCard, OnboardingStep.GameStarted),
        t(OnboardingStep.GameStarted, OnboardingEvent.PutSecondCard, OnboardingStep.OpponentTurn),
        t(OnboardingStep.GameStartedCycledInfo, OnboardingEvent.NextStackCard, OnboardingStep.GameStarted),
        t(OnboardingStep.GameStartedCycledInfo, OnboardingEvent.PutSecondCard, OnboardingStep.OpponentTurn),

        t(OnboardingStep.OpponentTurn, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurnCycledInfo, cycledInfoHooks),
        t(OnboardingStep.OpponentTurn, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurn),
        t(OnboardingStep.OpponentTurn, OnboardingEvent.PutSecondCard, OnboardingStep.Result),
        t(OnboardingStep.OpponentTurnCycledInfo, OnboardingEvent.NextStackCard, OnboardingStep.OpponentTurn),
        t(OnboardingStep.OpponentTurnCycledInfo, OnboardingEvent.PutSecondCard, OnboardingStep.Result),
      ],
    })
  }
}
