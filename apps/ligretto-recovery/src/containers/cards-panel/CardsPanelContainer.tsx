import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'

import { CardsPanel } from 'components/blocks/game'
import { tapLigrettoDeckCardAction, selectPlayerLigrettoDeckCards } from 'ducks/game'

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
