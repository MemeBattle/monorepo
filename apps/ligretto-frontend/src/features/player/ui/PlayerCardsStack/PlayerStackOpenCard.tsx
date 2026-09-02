import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardHotkey, useCardInteraction, useDraggableCard } from '#features/cardInteraction'

interface PlayerStackOpenCardProps {
  card: PlayerCard
}

export const PlayerStackOpenCard = ({ card }: PlayerStackOpenCardProps) => {
  const { isActive, isDimmed, toggleActiveTarget } = useCardInteraction(
    {
      type: 'open-stack',
    },
    [card.color, card.value],
  )
  const { id: dragId, isDragging, listeners, setNodeRef } = useDraggableCard({ type: 'open-stack' }, card)

  const onCardActivate = toggleActiveTarget

  useCardHotkey(Hotkey.x, onCardActivate)

  return (
    <Card
      {...card}
      {...listeners}
      ref={setNodeRef}
      data-card-drag-source
      data-card-drag-id={dragId}
      data-card-interaction-element
      isSelected={isActive}
      isDarkened={isDimmed}
      onClick={onCardActivate}
      style={{ opacity: isDragging ? 0 : 1, touchAction: 'none' }}
    />
  )
}
