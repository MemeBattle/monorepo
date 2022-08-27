import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'

import { Playground } from 'components/blocks/game'
import { playgroundDecksSelector, tapPlaygroundCardAction } from 'ducks/game'

const PlaygroundContainerSelector = createSelector([playgroundDecksSelector], playgroundDecks => ({
  playgroundDecks,
}))

export const PlaygroundContainer = () => {
  const dispatch = useDispatch()
  const { playgroundDecks } = useSelector(PlaygroundContainerSelector)

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      dispatch(
        tapPlaygroundCardAction({
          deckPosition: playgroundDeckIndex,
        }),
      )
    },
    [dispatch],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
