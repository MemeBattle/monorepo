import type { Card } from '@memebattle/ligretto-shared'
import type { CardInteractionTarget } from '#features/cardInteraction'
import type { OnboardingGame } from '#features/onboarding'

/** The onboarding's own card lookup — it runs on the scripted game, not on the real one. */
export const cardByOnboardingTarget = (game: OnboardingGame, target?: CardInteractionTarget): Card | undefined => {
  const player = game.players.id0
  if (!player) {
    return undefined
  }
  if (target?.type === 'row') {
    return player.cards[target.index] ?? undefined
  }
  if (target?.type === 'open-stack') {
    return player.stackOpenDeck.cards[0]
  }
  return undefined
}
