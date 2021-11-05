import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'

import { Playground } from 'components/blocks/game'
import { selectPlaygroundDecks, selectSelectedCardIndex, STACK_OPEN_DECK_INDEX, tapCardAction, tapStackOpenDeckCardAction } from 'ducks/game'

const PlaygroundContainerSelector = createSelector([selectPlaygroundDecks, selectSelectedCardIndex], (playgroundDecks, selectedCardIndex) => ({
  playgroundDecks,
  selectedCardIndex,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, selectedCardIndex } = useSelector(PlaygroundContainerSelector)

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (typeof selectedCardIndex === 'number') {
        dispatch(tapCardAction({ cardIndex: selectedCardIndex, playgroundDeckIndex }))
      } else if (selectedCardIndex === STACK_OPEN_DECK_INDEX) {
        dispatch(tapStackOpenDeckCardAction({ playgroundDeckIndex }))
      }
    },
    [dispatch, selectedCardIndex],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
