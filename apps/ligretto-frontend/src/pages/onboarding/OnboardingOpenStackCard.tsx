import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardInteraction } from '#features/cardInteraction'

interface OnboardingOpenStackCardProps {
  card?: PlayerCard
  isActive: boolean
}

export const OnboardingOpenStackCard = ({ card, isActive }: OnboardingOpenStackCardProps) => {
  // Passing the card only while the step allows it drops the selection when the step moves on.
  const interaction = useCardInteraction({ type: 'open-stack' }, (isActive && card) || undefined)

  return (
    <CardPlace dataTestId="OnboardingPage-Stack-OpenDeck">
      {card && (
        <CardHotkeyBadge>
          <Card
            {...card}
            data-card-interaction-element
            data-card-active={interaction.isActive}
            isDarkened={interaction.isDimmed}
            isDisabled={!isActive}
            isSelected={interaction.isActive}
            onClick={isActive ? interaction.toggleActiveTarget : undefined}
          />
        </CardHotkeyBadge>
      )}
    </CardPlace>
  )
}
