import { useSelector } from 'react-redux'

import { Playground } from './Playground'
import { playgroundDecksSelector } from '#ducks/game'

export const PlaygroundContainer = () => {
  const playgroundDecks = useSelector(playgroundDecksSelector)
  return <Playground cardsDecks={playgroundDecks} />
}

PlaygroundContainer.displayName = 'PlaygroundContainer'
