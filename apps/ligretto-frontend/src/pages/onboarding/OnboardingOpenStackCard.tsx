import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardInteraction } from '#features/cardInteraction'

interface OnboardingOpenStackCardProps {
  card?: PlayerCard
  isActive: boolean
}

export const OnboardingOpenStackCard = ({ card, isActive }: OnboardingOpenStackCardProps) => {
  const interaction = useCardInteraction({ type: 'open-stack' }, [card?.color, card?.value, isActive])

  return (
    <CardHotkeyBadge>
      <CardPlace dataTestId="OnboardingPage-Stack-OpenDeck">
        {card && (
          <Card
            {...card}
            data-card-interaction-element
            data-card-active={interaction.isActive}
            isDarkened={interaction.isDimmed}
            isDisabled={!isActive}
            isSelected={interaction.isActive}
            onClick={isActive ? interaction.toggleActiveTarget : undefined}
          />
        )}
      </CardPlace>
    </CardHotkeyBadge>
  )
}
