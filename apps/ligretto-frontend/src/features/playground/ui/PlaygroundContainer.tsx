import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { Playground } from './Playground'
import { gameIdSelector, playgroundDecksSelector } from '#ducks/game'
import { useCardInteraction, type CardDragData, type CardInteractionTarget } from '#features/cardInteraction'

const playgroundContainerSelector = createSelector([playgroundDecksSelector, gameIdSelector], (playgroundDecks, gameId) => ({
  playgroundDecks,
  gameId,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, gameId } = useSelector(playgroundContainerSelector)
  const { activeTarget } = useCardInteraction()

  const placeCard = useCallback(
    (target: CardInteractionTarget, playgroundDeckIndex: number) => {
      if (target.type === 'row') {
        dispatch(putCardAction({ cardIndex: target.index, gameId, playgroundDeckIndex }))
      } else {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex }))
      }
    },
    [dispatch, gameId],
  )

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (activeTarget) {
        placeCard(activeTarget, playgroundDeckIndex)
      }
    },
    [activeTarget, placeCard],
  )

  const handlePlaygroundDeckDrop = useCallback(
    (dragged: CardDragData, playgroundDeckIndex: number) => {
      placeCard(dragged.target, playgroundDeckIndex)
    },
    [placeCard],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} onDeckDrop={handlePlaygroundDeckDrop} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
