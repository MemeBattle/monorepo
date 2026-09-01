import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { Hotkey, tapStackOpenDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { useCardHotkey } from '../../lib/useCardHotkey'
import { useDraggableCard } from '#features/cardPlacement'

interface PlayerStackOpenCardProps {
  card: PlayerCard
}

export const PlayerStackOpenCard = ({ card }: PlayerStackOpenCardProps) => {
  const dispatch = useDispatch()
  const { isFocused, isDimmed, toggleFocus } = useCardFocus(
    {
      type: 'open-stack',
    },
    [card.color, card.value],
  )
  const draggable = useDraggableCard({ type: 'open-stack' }, card)

  const onCardActivate = () => {
    if (card.value !== 1) {
      toggleFocus()
      return
    }
    dispatch(tapStackOpenDeckCardAction())
  }

  useCardHotkey(Hotkey.x, onCardActivate)

  return <Card {...card} {...draggable} data-card-focus-element isSelected={isFocused} isDarkened={isDimmed} onClick={onCardActivate} />
}
