import type { AnyAction } from '@reduxjs/toolkit'
import type { CardFocusOptions } from '#features/cardFocus/ui/CardFocusContext'
import { OnboardingEvent, OPPONENT_DECK_INDEX, putSecondCardAction, putStackCardAction, putThirdCardAction } from '#features/onboarding'

export const getOnboardingPlacementAction = (
  focusedCard: CardFocusOptions | undefined,
  allowedEvents: OnboardingEvent[],
  playgroundDeckIndex: number,
): AnyAction | undefined => {
  if (focusedCard?.type === 'open-stack' && allowedEvents.includes(OnboardingEvent.PutStackCard) && playgroundDeckIndex === 0) {
    return putStackCardAction()
  }

  if (focusedCard?.type !== 'row') {
    return undefined
  }

  if (focusedCard.index === 1 && allowedEvents.includes(OnboardingEvent.PutSecondCard) && playgroundDeckIndex === 0) {
    return putSecondCardAction()
  }

  if (focusedCard.index === 2 && allowedEvents.includes(OnboardingEvent.PutThirdCard) && playgroundDeckIndex === OPPONENT_DECK_INDEX) {
    return putThirdCardAction()
  }

  return undefined
}
