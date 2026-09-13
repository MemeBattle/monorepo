import { OnboardingEvent, onboardingAllowedEventsSelector, onboardingGameSelector } from '#features/onboarding'
import type { CardInteractionTarget } from '#features/cardInteraction'
import type { All } from '#types/store'

const rowEvents = [OnboardingEvent.PutFirstCard, OnboardingEvent.PutSecondCard, OnboardingEvent.PutThirdCard] as const

export const cardByOnboardingTarget = (state: All, target?: CardInteractionTarget) => {
  if (!target) {
    return
  }
  const player = onboardingGameSelector(state).players.id0
  const allowedEvents = onboardingAllowedEventsSelector(state)
  if (target.type === 'row' && allowedEvents.includes(rowEvents[target.index])) {
    return player.cards[target.index] ?? undefined
  }
  if (target.type === 'open-stack' && allowedEvents.includes(OnboardingEvent.PutStackCard)) {
    return player.stackOpenDeck.cards[0]
  }
}
