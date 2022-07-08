import React, { useMemo, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'
import { Card, CardPlace, CardsRow } from '@memebattle/ui'

import { tapCardAction, selectPlayerCards, selectIsDndEnabled, setSelectedCardIndexAction, selectSelectedCardIndex } from 'ducks/game'

const CardsRowContainerSelector = createSelector(
  [selectPlayerCards, selectIsDndEnabled, selectSelectedCardIndex],
  (playerCards, isDndEnabled, selectedCardIndex) => ({
    playerCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)

export const CardsRowContainer = () => {
  const dispatch = useDispatch()
  const { playerCards, isDndEnabled, selectedCardIndex } = useSelector(CardsRowContainerSelector)

  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      playerCards[i] ? newPlayerCardsArr.push(playerCards[i]) : newPlayerCardsArr.push(undefined)
    }

    return newPlayerCardsArr
  }, [playerCards])

  const onCardClick = useCallback(
    (index: number) => {
      if (isDndEnabled && cards[index]?.value !== 1) {
        dispatch(setSelectedCardIndexAction(index))
      } else {
        dispatch(tapCardAction({ cardIndex: index }))
      }
    },
    [dispatch, isDndEnabled, cards],
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
      {cards.map((card, index) => (
        <CardPlace key={index}>
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
      ))}
    </CardsRow>
  )
}
