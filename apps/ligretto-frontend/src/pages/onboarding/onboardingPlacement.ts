import type { AnyAction } from '@reduxjs/toolkit'
import type { CardInteractionTarget } from '#features/cardInteraction'
import {
  OnboardingEvent,
  OPPONENT_DECK_INDEX,
  putFirstCardAction,
  putSecondCardAction,
  putStackCardAction,
  putThirdCardAction,
} from '#features/onboarding'

export const getOnboardingPlacementAction = (
  activeTarget: CardInteractionTarget | undefined,
  allowedEvents: OnboardingEvent[],
  playgroundDeckIndex: number,
): AnyAction | undefined => {
  if (activeTarget?.type === 'open-stack' && allowedEvents.includes(OnboardingEvent.PutStackCard) && playgroundDeckIndex === 0) {
    return putStackCardAction()
  }

  if (activeTarget?.type !== 'row') {
    return undefined
  }

  if (activeTarget.index === 0 && allowedEvents.includes(OnboardingEvent.PutFirstCard) && playgroundDeckIndex === 0) {
    return putFirstCardAction()
  }

  if (activeTarget.index === 1 && allowedEvents.includes(OnboardingEvent.PutSecondCard) && playgroundDeckIndex === 0) {
    return putSecondCardAction()
  }

  if (activeTarget.index === 2 && allowedEvents.includes(OnboardingEvent.PutThirdCard) && playgroundDeckIndex === OPPONENT_DECK_INDEX) {
    return putThirdCardAction()
  }

  return undefined
}
