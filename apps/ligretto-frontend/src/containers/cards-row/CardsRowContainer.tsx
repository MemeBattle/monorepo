import React, { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'
import { CardHotkeyBadge } from '@memebattle/ui'
import { CardsRow } from 'components/blocks/game/CardsRow'

import { tapCardAction, playerCardsSelector, isDndEnabledSelector, setSelectedCardIndexAction, selectedCardIndexSelector, Hotkey } from 'ducks/game'
import { CardPlace } from 'components/blocks/game/CardPlace'
import { Card } from 'components/blocks/game/Card'

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
