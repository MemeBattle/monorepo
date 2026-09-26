import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { playerCardsSelector, Hotkey } from '#ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from '#entities/card'
import { useCardHotkey, useDraggableCard } from '#features/cardInteraction'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

interface PlayerRowCardProps {
  card: PlayerCard
  index: number
  hotkey?: Hotkey
}

const PlayerRowCard = ({ card, index, hotkey }: PlayerRowCardProps) => {
  const {
    id: dragId,
    isActive,
    isDimmed,
    isDragging,
    isPlacing,
    listeners,
    setNodeRef,
    toggleActiveTarget,
  } = useDraggableCard({ type: 'row', index }, card)
  const onCardActivate = toggleActiveTarget

  useCardHotkey(hotkey, onCardActivate)

  return (
    <CardHotkeyBadge hotkey={hotkey}>
      <Card
        {...card}
        {...listeners}
        ref={setNodeRef}
        data-card-drag-source
        data-card-drag-id={dragId}
        data-card-interaction-element
        isDarkened={isDimmed}
        isSelected={isActive}
        onClick={onCardActivate}
        isInvisible={isDragging || isPlacing}
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
