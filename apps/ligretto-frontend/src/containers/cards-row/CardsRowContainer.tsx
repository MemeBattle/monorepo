import React, { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'
import { Card, CardHotkeyBadge, CardPlace, CardsRow } from '@memebattle/ui'

import { tapCardAction, playerCardsSelector, isDndEnabledSelector, setSelectedCardIndexAction, selectedCardIndexSelector, Hotkey } from 'ducks/game'

const CardsRowContainerSelector = createSelector(
  [playerCardsSelector, isDndEnabledSelector, selectedCardIndexSelector],
  (playerCards, isDndEnabled, selectedCardIndex) => ({
    playerCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)

export const CardsRowContainer = () => {
  const dispatch = useDispatch()
  const { playerCards, isDndEnabled, selectedCardIndex } = useSelector(CardsRowContainerSelector)

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
        <CardHotkeyBadge key={index} hotkey={isDndEnabled ? hotkeys[index] : undefined}>
          <CardPlace>
            {card && (
              <Card
                {...card}
                disabled={typeof selectedCardIndex !== 'undefined' && selectedCardIndex !== index}
                selected={selectedCardIndex === index}
                onClick={() => onCardClick(index)}
                onClickOutside={() => onCardClickOutside(index)}
              />
            )}
          </CardPlace>
        </CardHotkeyBadge>
      ))}
    </CardsRow>
  )
}
