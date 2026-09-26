import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { useSelector } from 'react-redux'

import { Hotkey, playerStackOpenDeckCardsSelector } from '#ducks/game'
import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardHotkey, useDraggableCard } from '#features/cardInteraction'

const OpenCard = ({ card }: { card: PlayerCard }) => {
  const {
    id: dragId,
    isActive,
    isDimmed,
    isDragging,
    isPlacing,
    listeners,
    setNodeRef,
    toggleActiveTarget,
  } = useDraggableCard({ type: 'open-stack' }, card)

  useCardHotkey(Hotkey.x, toggleActiveTarget)

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
      onClick={toggleActiveTarget}
      isInvisible={isDragging || isPlacing}
    />
  )
}

export const PlayerStackOpenDeck = () => {
  const cards = useSelector(playerStackOpenDeckCardsSelector)
  if (!cards) {
    return null
  }
  const card = last(cards)

  return (
    <CardPlace>
      {card && (
        <CardHotkeyBadge hotkey={Hotkey.x}>
          <OpenCard card={card} />
        </CardHotkeyBadge>
      )}
    </CardPlace>
  )
}
