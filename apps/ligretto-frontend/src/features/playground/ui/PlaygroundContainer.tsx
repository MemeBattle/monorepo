import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { Playground } from './Playground'
import { gameIdSelector, playgroundDecksSelector } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'

const PlaygroundContainerSelector = createSelector([playgroundDecksSelector, gameIdSelector], (playgroundDecks, gameId) => ({
  playgroundDecks,
  gameId,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, gameId } = useSelector(PlaygroundContainerSelector)
  const { focusedCard } = useCardFocus()

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (!focusedCard) {
        return
      }

      if (focusedCard.type === 'open-stack') {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex }))
      } else if (focusedCard.type === 'row') {
        dispatch(putCardAction({ cardIndex: focusedCard.index, gameId, playgroundDeckIndex }))
      }
    },
    [dispatch, focusedCard, gameId],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
