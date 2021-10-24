import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
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
  [selectPlayerStackOpenDeckCards, selectPlayerStackDeckCards, selectPlayerLigrettoDeckCards],
  (playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards) => ({
    playerStackOpenDeckCards,
    playerStackDeckCards,
    playerLigrettoDeckCards,
  }),
)

export const CardsPanelContainer = () => {
  const dispatch = useDispatch()
  const { playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards } = useSelector(CardsPanelContainerSelector)

  const onStackOpenDeckCardClick = useCallback(() => {
    dispatch(tapStackOpenDeckCardAction())
  }, [dispatch])

  const onStackDeckCardClick = useCallback(() => {
    dispatch(tapStackDeckCardAction())
  }, [dispatch])

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  return (
    <CardsPanel
      stackOpenDeckCards={playerStackOpenDeckCards}
      stackDeckCards={playerStackDeckCards}
      ligrettoDeckCards={playerLigrettoDeckCards}
      onStackOpenDeckCardClick={onStackOpenDeckCardClick}
      onStackDeckCardClick={onStackDeckCardClick}
      onLigrettoDeckCardClick={onLigrettoDeckCardClick}
    />
  )
}
