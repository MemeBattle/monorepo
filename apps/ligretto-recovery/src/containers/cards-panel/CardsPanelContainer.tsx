import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { tapLigrettoDeckCardAction, selectPlayerLigrettoDeckCards } from 'ducks/game'
import { CardsPanel } from 'components/blocks/game'
import { createSelector } from 'reselect'

const CardsPanelContainerSelector = createSelector([selectPlayerLigrettoDeckCards], playerLigrettoDeckCards => ({
  playerLigrettoDeckCards,
}))

export const CardsPanelContainer = () => {
  const dispatch = useDispatch()
  const { playerLigrettoDeckCards } = useSelector(CardsPanelContainerSelector)

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  return <CardsPanel ligrettoDeckCards={playerLigrettoDeckCards} onLigrettoDeckCardClick={onLigrettoDeckCardClick} />
}
