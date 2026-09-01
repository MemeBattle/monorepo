import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'

import { Playground } from './Playground'
import { gameIdSelector, playgroundDecksSelector } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'
import { getCardPlacementAction, type CardDragData, type CardPlacementTarget } from '#features/cardPlacement'

const playgroundContainerSelector = createSelector([playgroundDecksSelector, gameIdSelector], (playgroundDecks, gameId) => ({
  playgroundDecks,
  gameId,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, gameId } = useSelector(playgroundContainerSelector)
  const { clearFocus, focusedCard } = useCardFocus()

  const placeCard = useCallback(
    (target: CardPlacementTarget, playgroundDeckIndex: number) => {
      dispatch(getCardPlacementAction(target, gameId, playgroundDeckIndex))
    },
    [dispatch, gameId],
  )

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (focusedCard) {
        placeCard(focusedCard, playgroundDeckIndex)
      }
    },
    [focusedCard, placeCard],
  )

  const handlePlaygroundDeckDrop = useCallback(
    (dragged: CardDragData, playgroundDeckIndex: number) => {
      placeCard(dragged.target, playgroundDeckIndex)
      clearFocus()
    },
    [clearFocus, placeCard],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} onDeckDrop={handlePlaygroundDeckDrop} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
