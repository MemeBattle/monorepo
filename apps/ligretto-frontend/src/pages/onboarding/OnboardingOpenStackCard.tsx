import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { putStackCardAction } from '#features/onboarding'

interface OnboardingOpenStackCardProps {
  card?: PlayerCard
  isActive: boolean
}

export const OnboardingOpenStackCard = ({ card, isActive }: OnboardingOpenStackCardProps) => {
  const dispatch = useDispatch()
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'open-stack' }, [card?.color, card?.value])
  const onCardActivate = useCallback(() => {
    if (!card || !isActive) {
      return
    }
    if (card.value === 1) {
      dispatch(putStackCardAction())
      return
    }
    toggleFocus()
  }, [card, dispatch, isActive, toggleFocus])

  return (
    <CardHotkeyBadge>
      <CardPlace dataTestId="OnboardingPage-Stack-OpenDeck">
        {card && (
          <Card
            {...card}
            data-card-focus-element
            data-card-focused={isFocused}
            isDarkened={isDimmed}
            isDisabled={!isActive}
            isSelected={isFocused}
            onClick={onCardActivate}
          />
        )}
      </CardPlace>
    </CardHotkeyBadge>
  )
}
