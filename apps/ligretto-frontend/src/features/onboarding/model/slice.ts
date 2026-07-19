import type { GameResults } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import type { OnboardingGame } from './fsm'
import { OnboardingStep, createOnboardingGame } from './fsm'

export type OnboardingState = {
  step: OnboardingStep
  game: OnboardingGame
  results?: GameResults
}

export const initialState: OnboardingState = {
  step: OnboardingStep.Opponents,
  game: createOnboardingGame(),
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
    results(state) {
      return state.results
    },
  },
})

export const { setOnboardingState } = onboardingSlice.actions
export const {
  game: onboardingGameSelector,
  step: onboardingStepSelector,
  results: onboardingResultsSelector,
} = onboardingSlice.getSelectors((root: { onboarding: OnboardingState }) => root.onboarding)
export const onboardingReducer = onboardingSlice.reducer
