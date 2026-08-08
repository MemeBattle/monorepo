import type { UnknownAction } from '@reduxjs/toolkit'
import { type TypedStartListening } from '@reduxjs/toolkit'
import { OnboardingEvent, getAllowedEvents } from './fsm'
import { OnboardingStateMachine, OnboardingStep } from './fsm'
import {
  nextStepOnboardingAction,
  putLigrettoCardAction,
  setOnboardingState,
  putFirstCardAction,
  putSecondCardAction,
  putThirdCardAction,
  putStackCardAction,
  nextStackCardAction,
} from './slice'
import { All } from '@fsmoothy/core'
import type { RouterActions } from 'redux-first-history'
import { LOCATION_CHANGE } from 'redux-first-history'
import { matchPath } from 'react-router'
import { routes } from '#shared/constants/router-constants.js'

// The FSM mutates its game object in place, so the store needs a deep copy to notice changes.
const toOnboardingState = async (fsm: OnboardingStateMachine) => ({
  step: fsm.current,
  game: structuredClone(fsm.context.data.game),
  results: fsm.context.data.results,
  allowedEvents: await getAllowedEvents(fsm),
})

const isLocationChangeAction = (action: UnknownAction): action is Extract<RouterActions, { type: typeof LOCATION_CHANGE }> =>
  action.type === LOCATION_CHANGE

const mapActionTypeToEvent: Record<string, OnboardingEvent> = {
  [nextStepOnboardingAction.type]: OnboardingEvent.NextStep,
  [putLigrettoCardAction.type]: OnboardingEvent.PutLigretto,
  [putFirstCardAction.type]: OnboardingEvent.PutFirstCard,
  [putSecondCardAction.type]: OnboardingEvent.PutSecondCard,
  [putThirdCardAction.type]: OnboardingEvent.PutThirdCard,
  [putStackCardAction.type]: OnboardingEvent.PutStackCard,
  [nextStackCardAction.type]: OnboardingEvent.NextStackCard,
}

export function addListeners(startListener: TypedStartListening<unknown>) {
  startListener({
    predicate(action: UnknownAction) {
      if (isLocationChangeAction(action)) {
        return !!matchPath(routes.ONBOARDING, action.payload.location.pathname)
      }

      return false
    },
    effect: async (_action, listenerApi) => {
      // Re-entering /onboarding restarts the onboarding: cancel the previous loop.
      listenerApi.cancelActiveListeners()

      const fsm = new OnboardingStateMachine()

      listenerApi.dispatch(setOnboardingState(await toOnboardingState(fsm)))

      fsm.on(All, async function (this: OnboardingStateMachine) {
        listenerApi.dispatch(setOnboardingState(await toOnboardingState(this)))
      })

      while (true) {
        const [action] = await listenerApi.take(action => !!mapActionTypeToEvent[action.type] || isLocationChangeAction(action))

        if (isLocationChangeAction(action)) {
          if (!matchPath(routes.ONBOARDING, action.payload.location.pathname)) {
            break
          }
          continue
        }

        const event = mapActionTypeToEvent[action.type]
        await fsm.tryTransition(event)

        if (fsm.current === OnboardingStep.Result) {
          break
        }
      }
    },
  })
}
