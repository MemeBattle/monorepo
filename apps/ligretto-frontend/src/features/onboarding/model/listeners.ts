import type { UnknownAction } from '@reduxjs/toolkit'
import { type TypedStartListening } from '@reduxjs/toolkit'
import { OnboardingEvent } from './fsm'
import { OnboardingStateMachine, OnboardingStep } from './fsm'
import {
  nextStepOnboardingAction,
  putLigrettoCardAction,
  setOnboardingState,
  putFirstCardAction,
  putSecondCardAction,
  putStackCardAction,
  nextStackCardAction,
  putThirdCardAction,
} from './slice'
import { All } from '@fsmoothy/core'
import type { RouterActions } from 'redux-first-history'
import { LOCATION_CHANGE } from 'redux-first-history'
import { matchPath } from 'react-router'
import { routes } from '#shared/constants/router-constants.js'
import cloneDeep from 'lodash/cloneDeep'
import { render } from '@fsmoothy/graphviz'

const isLocationChangeAction = (action: UnknownAction): action is Extract<RouterActions, { type: typeof LOCATION_CHANGE }> =>
  action.type === LOCATION_CHANGE

const mapActionTypeToEvent = {
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
      const fsm = new OnboardingStateMachine()
      console.log(render(fsm.inspect()))

      listenerApi.dispatch(setOnboardingState({ step: fsm.current, game: cloneDeep(fsm.context.data.game) }))

      fsm.on(All, function (this: OnboardingStateMachine, ctx) {
        listenerApi.dispatch(setOnboardingState({ step: this.current, game: cloneDeep(ctx.data.game) }))
      })

      while (true) {
        const [action] = await listenerApi.take(action => !!mapActionTypeToEvent[action.type])

        const event = mapActionTypeToEvent[action.type]
        await fsm.tryTransition(event)

        if (fsm.current === OnboardingStep.Result) {
          break
        }
      }
    },
  })
}
