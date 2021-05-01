import React, { useMemo, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  tapCardAction,
  selectPlayerCards,
  selectPlayerStackOpenDeckCards,
  tapStackOpenDeckCardAction,
  tapStackDeckCardAction,
  selectPlayerStackDeckCards,
  tapLigrettoDeckCardAction,
  selectPlayerLigrettoDeckCards,
} from 'ducks/game'
import { CardsPanel } from 'components/blocks/game'
import { createSelector } from 'reselect'

const CardsPanelContainerSelector = createSelector(
  [selectPlayerCards, selectPlayerStackOpenDeckCards, selectPlayerStackDeckCards, selectPlayerLigrettoDeckCards],
  (playerCards, playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards) => ({
    playerCards,
    playerStackOpenDeckCards,
    playerStackDeckCards,
    playerLigrettoDeckCards,
  }),
)

export const CardsPanelContainer = () => {
  const dispatch = useDispatch()
  const { playerCards, playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards } = useSelector(CardsPanelContainerSelector)

  const onCardRowClick = useCallback(
    (index: number) => {
      dispatch(tapCardAction({ cardIndex: index }))
    },
    [dispatch],
  )

  const onStackOpenDeckCardClick = useCallback(() => {
    dispatch(tapStackOpenDeckCardAction())
  }, [dispatch])

  const onStackDeckCardClick = useCallback(() => {
    dispatch(tapStackDeckCardAction())
  }, [dispatch])

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      playerCards[i] ? newPlayerCardsArr.push(playerCards[i]) : newPlayerCardsArr.push({})
    }

    return newPlayerCardsArr
  }, [playerCards])

  return (
    <CardsPanel
      cards={cards}
      stackOpenDeckCards={playerStackOpenDeckCards}
      stackDeckCards={playerStackDeckCards}
      ligrettoDeckCards={playerLigrettoDeckCards}
      onCardRowClick={onCardRowClick}
      onStackOpenDeckCardClick={onStackOpenDeckCardClick}
      onStackDeckCardClick={onStackDeckCardClick}
      onLigrettoDeckCardClick={onLigrettoDeckCardClick}
    />
  )
}
