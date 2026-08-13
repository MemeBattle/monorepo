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
  const { isFocused, isDimmed, toggleFocus, clearFocus } = useCardFocus({
    type: 'open-stack',
    card,
  })

  const handleClick = () => {
    if (isDndEnabled && card.value !== 1) {
      toggleFocus()
    } else {
      clearFocus()
      dispatch(tapStackOpenDeckCardAction())
    }
  }

  return <Card {...card} data-card-focus-element isSelected={isFocused} isDarkened={isDimmed} onClick={handleClick} />
}
