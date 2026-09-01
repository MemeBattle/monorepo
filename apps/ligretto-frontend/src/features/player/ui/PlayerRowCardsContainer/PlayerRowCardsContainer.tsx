import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { playerCardsSelector, Hotkey } from '#ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { useCardHotkey } from '../../lib/useCardHotkey'
import { useDraggableCard } from '#features/cardPlacement'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

interface PlayerRowCardProps {
  card: PlayerCard
  index: number
  hotkey?: Hotkey
}

const PlayerRowCard = ({ card, index, hotkey }: PlayerRowCardProps) => {
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'row', index }, [card.color, card.value])
  const { id: dragId, isDragging, listeners, setNodeRef } = useDraggableCard({ type: 'row', index }, card)
  const onCardActivate = toggleFocus

  useCardHotkey(hotkey, onCardActivate)

  return (
    <CardHotkeyBadge hotkey={hotkey}>
      <Card
        {...card}
        {...listeners}
        ref={setNodeRef}
        data-card-drag-source
        data-card-drag-id={dragId}
        data-card-focus-element
        isDarkened={isDimmed}
        isSelected={isFocused}
        onClick={onCardActivate}
        style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'none' }}
      />
    </CardHotkeyBadge>
  )
}

export const PlayerRowCardsContainer = () => {
  const playerCards = useSelector(playerCardsSelector)
  const hotkeys = useMemo(() => [Hotkey.q, Hotkey.w, Hotkey.e, Hotkey.r, Hotkey.t], [])

  return (
    <CardsRow>
      {playerCards?.map((card, index) => (
        <CardPlace key={index}>{card && <PlayerRowCard card={card} index={index} hotkey={hotkeys[index]} />}</CardPlace>
      ))}
    </CardsRow>
  )
}
