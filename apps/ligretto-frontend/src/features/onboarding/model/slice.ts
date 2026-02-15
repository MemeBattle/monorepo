import { CardColors, PlayerStatus, type Game, type GameResults, type Player } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import { OnboardingStep } from './fsm'

export type OnboardingState = {
  step: OnboardingStep
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
  results?: GameResults
}

export const initialState: OnboardingState = {
  step: OnboardingStep.Opponents,
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
  results: undefined,
}

export const nextStepOnboardingAction = createAction('features/onboarding/next')
export const putStackCardAction = createAction('features/onboarding/putStackCard')
export const nextStackCardAction = createAction('features/onboarding/nextStackCard')
export const putFirstCardAction = createAction('features/onboarding/putFirstCard')
export const putSecondCardAction = createAction('features/onboarding/putSecondCard')
export const putThirdCardAction = createAction('features/onboarding/putThirdCard')
export const putLigrettoCardAction = createAction('features/onboarding/putLigrettoCard')

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    setOnboardingState(_state, action: PayloadAction<OnboardingState>) {
      return action.payload
    },
  },
  selectors: {
    game(state) {
      return state.game
    },
    step(state) {
      return state.step
    },
  },
})

export const { setOnboardingState } = onboardingSlice.actions
export const { game: onboardingGameSelector, step: onboardingStepSelector } = onboardingSlice.getSelectors(
  (root: { onboarding: OnboardingState }) => root.onboarding,
)
export const onboardingReducer = onboardingSlice.reducer
