import React, { useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { tapCardAction, playerCardsSelector, Hotkey } from '#ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { useCardHotkey } from '../../lib/useCardHotkey'
import { DraggableCard } from '#features/cardPlacement'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

interface PlayerRowCardProps {
  card: PlayerCard
  index: number
  hotkey?: Hotkey
}

const PlayerRowCard = ({ card, index, hotkey }: PlayerRowCardProps) => {
  const dispatch = useDispatch()
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'row', index }, [card.color, card.value])
  const onCardActivate = () => {
    if (card.value !== 1) {
      toggleFocus()
      return
    }
    dispatch(tapCardAction({ cardIndex: index }))
  }

  useCardHotkey(hotkey, onCardActivate)

  return (
    <CardHotkeyBadge hotkey={hotkey}>
      <DraggableCard target={{ type: 'row', index }} card={card}>
        <Card {...card} data-card-focus-element isDarkened={isDimmed} isSelected={isFocused} onClick={onCardActivate} />
      </DraggableCard>
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
