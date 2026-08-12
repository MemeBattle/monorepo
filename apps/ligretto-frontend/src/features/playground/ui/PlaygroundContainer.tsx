import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { Playground } from './Playground'
import { gameIdSelector, isDndEnabledSelector, playgroundDecksSelector } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'

const PlaygroundContainerSelector = createSelector(
  [playgroundDecksSelector, gameIdSelector, isDndEnabledSelector],
  (playgroundDecks, gameId, isDndEnabled) => ({ playgroundDecks, gameId, isDndEnabled }),
)

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, gameId, isDndEnabled } = useSelector(PlaygroundContainerSelector)
  const { focusedCard, clearFocus } = useCardFocus()

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (!isDndEnabled || !focusedCard) {
        return
      }

      if (focusedCard.type === 'stack-open') {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex }))
      } else {
        dispatch(putCardAction({ cardIndex: focusedCard.index, gameId, playgroundDeckIndex }))
      }
      clearFocus()
    },
    [clearFocus, dispatch, focusedCard, gameId, isDndEnabled],
  )

  const handlePlaygroundClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (focusedCard) {
        handlePlaygroundDeckClick(playgroundDeckIndex)
      }
    },
    [focusedCard, handlePlaygroundDeckClick],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundClick} allowEmptyDeckClick={!!focusedCard} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
