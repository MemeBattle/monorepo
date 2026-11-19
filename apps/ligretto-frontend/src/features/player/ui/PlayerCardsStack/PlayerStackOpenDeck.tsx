import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { useSelector } from 'react-redux'

import { Hotkey, playerStackOpenDeckCardsSelector } from '#ducks/game'
import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardHotkey, useDraggableCard } from '#features/cardInteraction'
import { CardViewTransition } from '#features/cardAnimation'

const OpenCard = ({ card }: { card: PlayerCard }) => {
  const { id: dragId, isActive, isDimmed, isDragging, listeners, setNodeRef, toggleActiveTarget } = useDraggableCard({ type: 'open-stack' }, card)

  useCardHotkey(Hotkey.x, toggleActiveTarget)

  return (
    // A dragged card is already over its deck when it is dropped: it must not fly there again from the stack.
    <CardViewTransition name={card.id} share={isDragging ? 'none' : 'auto'}>
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
        isInvisible={isDragging}
      />
    </CardViewTransition>
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
          <OpenCard key={card.id} card={card} />
        </CardHotkeyBadge>
      )}
    </CardPlace>
  )
}
