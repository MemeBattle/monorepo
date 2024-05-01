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
  Next = 'next',
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
      initial: OnboardingStep.LigrettoCard,
      data() {
        return {
          stack: [],
          isCycledInfoShown: false,
          game: {
            players: {
              id0: {
                id: 'id0',
                cards: [
                  { value: 5, color: CardColors.blue },
                  { value: 5, color: CardColors.blue },
                  { value: 5, color: CardColors.blue },
                ],
                status: PlayerStatus.InGame,
                ligrettoDeck: {
                  isHidden: true,
                  cards: [{ value: 5, color: CardColors.blue }],
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
        t(OnboardingStep.Opponents, OnboardingEvent.Next, OnboardingStep.Playground),
        t(OnboardingStep.Playground, OnboardingEvent.Next, OnboardingStep.Cards),
        t(OnboardingStep.Cards, OnboardingEvent.Next, OnboardingStep.Stack),
        t(OnboardingStep.Stack, OnboardingEvent.Next, OnboardingStep.Row),
        t(OnboardingStep.Row, OnboardingEvent.Next, OnboardingStep.Ligretto),
        t(OnboardingStep.Ligretto, OnboardingEvent.Next, OnboardingStep.FirstCard),

        t(OnboardingStep.FirstCard, OnboardingEvent.PutFirstCard, OnboardingStep.LigrettoCard),
        t(OnboardingStep.LigrettoCard, OnboardingEvent.PutLigretto, OnboardingStep.StackCard, {
          onEnter(ctx) {
            ctx.data.game.players.id0.ligrettoDeck.cards = []
          },
        }),
        t(OnboardingStep.StackCard, OnboardingEvent.NextStackCard, OnboardingStep.StackUnavailableCard),
        t(OnboardingStep.StackUnavailableCard, OnboardingEvent.NextStackCard, OnboardingStep.StackAvailableCard),
        t(OnboardingStep.StackAvailableCard, OnboardingEvent.PutStackCard, OnboardingStep.RowAvailableCard),
        t(OnboardingStep.RowAvailableCard, OnboardingEvent.PutSecondCard, OnboardingStep.LigrettoAvailableCard),
        t(OnboardingStep.LigrettoAvailableCard, OnboardingEvent.PutLigretto, OnboardingStep.GameStarted),

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
