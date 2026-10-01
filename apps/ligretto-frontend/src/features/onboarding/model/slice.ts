import type { GameResults } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import type { OnboardingGame } from './fsm'
import { OnboardingEvent, OnboardingStep, createOnboardingGame } from './fsm'

export type OnboardingState = {
  step: OnboardingStep
  game: OnboardingGame
  /** Events the FSM accepts on this step — drives which cards/decks are clickable. */
  allowedEvents: Array<OnboardingEvent>
  /** The deck the scripted opponent plays its green run into, once it has opened it. */
  opponentPileIndex?: number
  results?: GameResults
}

const initialState: OnboardingState = {
  step: OnboardingStep.Opponents,
  game: createOnboardingGame(),
  allowedEvents: [OnboardingEvent.NextStep],
  results: undefined,
}

export const nextStepOnboardingAction = createAction('features/onboarding/next')
/** Where the player put a card; the scripted transitions fall back to their own deck without it. */
export interface OnboardingPlacementPayload {
  playgroundDeckIndex: number
}

export const putStackCardAction = createAction<OnboardingPlacementPayload>('features/onboarding/putStackCard')
export const nextStackCardAction = createAction('features/onboarding/nextStackCard')
export const putFirstCardAction = createAction<OnboardingPlacementPayload>('features/onboarding/putFirstCard')
export const putSecondCardAction = createAction<OnboardingPlacementPayload>('features/onboarding/putSecondCard')
export const putThirdCardAction = createAction<OnboardingPlacementPayload>('features/onboarding/putThirdCard')
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
    allowedEvents(state) {
      return state.allowedEvents
    },
    opponentPileIndex(state) {
      return state.opponentPileIndex
    },
  },
})

export const { setOnboardingState } = onboardingSlice.actions
export const {
  game: onboardingGameSelector,
  step: onboardingStepSelector,
  results: onboardingResultsSelector,
  allowedEvents: onboardingAllowedEventsSelector,
  opponentPileIndex: onboardingOpponentPileIndexSelector,
} = onboardingSlice.getSelectors((root: { onboarding: OnboardingState }) => root.onboarding)
export const onboardingReducer = onboardingSlice.reducer
