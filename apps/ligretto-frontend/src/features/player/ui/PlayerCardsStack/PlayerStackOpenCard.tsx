import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { useCardHotkey } from '../../lib/useCardHotkey'
import { useDraggableCard } from '#features/cardPlacement'

interface PlayerStackOpenCardProps {
  card: PlayerCard
}

export const PlayerStackOpenCard = ({ card }: PlayerStackOpenCardProps) => {
  const { isFocused, isDimmed, toggleFocus } = useCardFocus(
    {
      type: 'open-stack',
    },
    [card.color, card.value],
  )
  const { id: dragId, isDragging, listeners, setNodeRef } = useDraggableCard({ type: 'open-stack' }, card)

  const onCardActivate = toggleFocus

  useCardHotkey(Hotkey.x, onCardActivate)

  return (
    <Card
      {...card}
      {...listeners}
      ref={setNodeRef}
      data-card-drag-source
      data-card-drag-id={dragId}
      data-card-focus-element
      isSelected={isFocused}
      isDarkened={isDimmed}
      onClick={onCardActivate}
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'none' }}
    />
  )
}
