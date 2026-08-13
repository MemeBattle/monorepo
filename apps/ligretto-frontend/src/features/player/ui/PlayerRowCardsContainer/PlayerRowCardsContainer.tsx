import React, { useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { tapCardAction, playerCardsSelector, isDndEnabledSelector, Hotkey } from '#ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

const PlayerRowCardsContainerSelector = createSelector([playerCardsSelector, isDndEnabledSelector], (playerCards, isDndEnabled) => ({
  playerCards,
  isDndEnabled,
}))

interface PlayerRowCardProps {
  card: PlayerCard
  index: number
  isDndEnabled: boolean
  hotkey?: Hotkey
}

const PlayerRowCard = ({ card, index, isDndEnabled, hotkey }: PlayerRowCardProps) => {
  const dispatch = useDispatch()
  const canFocus = isDndEnabled && card.value !== 1
  const activateCard = React.useCallback(() => dispatch(tapCardAction({ cardIndex: index })), [dispatch, index])
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'row', index }, [card.color, card.value], { canFocus, onActivate: activateCard })
  const onCardClick = () => {
    toggleFocus()
    if (canFocus) {
      return
    }
  }

  return (
    <CardHotkeyBadge hotkey={isDndEnabled ? hotkey : undefined}>
      <Card {...card} data-card-focus-element isDarkened={isDimmed} isSelected={isFocused} onClick={onCardClick} />
    </CardHotkeyBadge>
  )
}

export const PlayerRowCardsContainer = () => {
  const { playerCards, isDndEnabled } = useSelector(PlayerRowCardsContainerSelector)
  const hotkeys = useMemo(() => [Hotkey.q, Hotkey.w, Hotkey.e, Hotkey.r, Hotkey.t], [])

  return (
    <CardsRow>
      {playerCards?.map((card, index) => (
        <CardPlace key={index}>{card && <PlayerRowCard card={card} index={index} isDndEnabled={isDndEnabled} hotkey={hotkeys[index]} />}</CardPlace>
      ))}
    </CardsRow>
  )
}
