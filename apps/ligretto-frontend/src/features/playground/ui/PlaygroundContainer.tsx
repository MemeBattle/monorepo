import React, { useCallback } from 'react'
import { useSelector } from 'react-redux'

import { Playground } from './Playground'
import { playgroundDecksSelector } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'
import { useCardPlacement } from '#features/cardPlacement'

export const PlaygroundContainer = () => {
  const playgroundDecks = useSelector(playgroundDecksSelector)
  const { focusedCard } = useCardFocus()
  const { placeCard } = useCardPlacement()

  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      if (!focusedCard) {
        return
      }

      placeCard(focusedCard, playgroundDeckIndex)
    },
    [focusedCard, placeCard],
  )

  return <Playground cardsDecks={playgroundDecks} onDeckClick={handlePlaygroundDeckClick} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
