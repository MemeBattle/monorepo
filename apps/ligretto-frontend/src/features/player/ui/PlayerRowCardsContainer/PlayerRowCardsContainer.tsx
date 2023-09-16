import React, { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { CardsRow } from 'entities/card/ui/CardsRow'

import { tapCardAction, playerCardsSelector, isDndEnabledSelector, setSelectedCardIndexAction, selectedCardIndexSelector, Hotkey } from 'ducks/game'
import { Card, CardPlace, CardHotkeyBadge } from 'entities/card'

const PlayerRowCardsContainerSelector = createSelector(
  [playerCardsSelector, isDndEnabledSelector, selectedCardIndexSelector],
  (playerCards, isDndEnabled, selectedCardIndex) => ({
    playerCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)

export const PlayerRowCardsContainer = () => {
  const dispatch = useDispatch()
  const { playerCards, isDndEnabled, selectedCardIndex } = useSelector(PlayerRowCardsContainerSelector)

  const hotkeys = useMemo(() => [Hotkey.q, Hotkey.w, Hotkey.e, Hotkey.r, Hotkey.t], [])

  const onCardClick = useCallback(
    (index: number) => {
      dispatch(tapCardAction({ cardIndex: index }))
    },
    [dispatch],
  )

  const onCardClickOutside = useCallback(
    (index: number) => {
      if (selectedCardIndex === index) {
        dispatch(setSelectedCardIndexAction(undefined))
      }
    },
    [dispatch, selectedCardIndex],
  )

  return (
    <CardsRow>
      {playerCards?.map((card, index) => (
        <CardPlace key={index}>
          {card && (
            <CardHotkeyBadge hotkey={isDndEnabled ? hotkeys[index] : undefined}>
              <Card
                {...card}
                isDarkened={typeof selectedCardIndex !== 'undefined' && selectedCardIndex !== index}
                isSelected={selectedCardIndex === index}
                onClick={() => onCardClick(index)}
                onClickOutside={() => onCardClickOutside(index)}
              />
            </CardHotkeyBadge>
          )}
        </CardPlace>
      ))}
    </CardsRow>
  )
}
