import { useCallback } from 'react'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { tapStackOpenDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'

interface PlayerStackOpenCardProps {
  card: PlayerCard
  isDndEnabled: boolean
}

export const PlayerStackOpenCard = ({ card, isDndEnabled }: PlayerStackOpenCardProps) => {
  const dispatch = useDispatch()
  const canFocus = isDndEnabled && card.value !== 1
  const activateCard = useCallback(() => dispatch(tapStackOpenDeckCardAction()), [dispatch])
  const { isFocused, isDimmed, toggleFocus } = useCardFocus(
    {
      type: 'open-stack',
    },
    [card.color, card.value],
    { canFocus, onActivate: activateCard },
  )

  return <Card {...card} data-card-focus-element isSelected={isFocused} isDarkened={isDimmed} onClick={toggleFocus} />
}
