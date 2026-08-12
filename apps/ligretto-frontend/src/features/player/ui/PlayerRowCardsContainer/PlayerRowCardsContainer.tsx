import React, { useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { tapCardAction, playerCardsSelector, isDndEnabledSelector, Hotkey } from '#ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from '#entities/card'
import { FocusableCard } from '#features/cardFocus'
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
  return (
    <FocusableCard target={{ type: 'row', index }} deps={[card.color, card.value]}>
      {({ isFocused, isDimmed, toggleFocus, clearFocus }) => {
        const onCardClick = () => {
          if (isDndEnabled && card.value !== 1) {
            toggleFocus()
          } else {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: index }))
          }
        }

        return (
          <CardHotkeyBadge hotkey={isDndEnabled ? hotkey : undefined}>
            <Card {...card} isDarkened={isDimmed} isSelected={isFocused} onClick={onCardClick} />
          </CardHotkeyBadge>
        )
      }}
    </FocusableCard>
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
