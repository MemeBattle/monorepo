import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { selectPlaygroundDecks, selectSelectedCardIndex, STACK_OPEN_DECK_INDEX, tapCardAction, tapStackOpenDeckCardAction } from 'ducks/game'
import { Playground } from 'components/blocks/game'
import { createSelector } from 'reselect'

const PlaygroundContainerSelector = createSelector([selectPlaygroundDecks, selectSelectedCardIndex], (playgroundDecks, selectedCardIndex) => ({
  playgroundDecks,
  selectedCardIndex,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks, selectedCardIndex } = useSelector(PlaygroundContainerSelector)

  const handlePlaygroundDeckClick = useCallback(
    (deckIndex: number) => {
      if (typeof selectedCardIndex === 'number') {
        dispatch(tapCardAction({ cardIndex: selectedCardIndex, deckIndex }))
      } else if (selectedCardIndex === STACK_OPEN_DECK_INDEX) {
        dispatch(tapStackOpenDeckCardAction({ deckIndex }))
      }
    },
    [dispatch, selectedCardIndex],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
