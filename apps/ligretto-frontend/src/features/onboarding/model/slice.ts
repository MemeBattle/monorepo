import type { Game, GameResults } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import { OnboardingStep } from './fsm'

export type OnboardingState = {
  step: OnboardingStep
  game: {
    players: Game['players']
    playground: {
      decks: Game['playground']['decks']
    }
  }
  results?: GameResults
}

export const initialState: OnboardingState = {
  step: OnboardingStep.Opponents,
  game: {
    players: {},
    playground: {
      decks: [],
    },
  },
  results: undefined,
}

export const nextStepOnboardingAction = createAction('@@onboarding/next')
export const putLigrettoAction = createAction('@@onboarding/putLigretto')

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
  },
})

export const { setOnboardingState } = onboardingSlice.actions
export const { game: onboardingGame } = onboardingSlice.getSelectors((root: { onboarding: OnboardingState }) => root.onboarding)
export const onboardingReducer = onboardingSlice.reducer
