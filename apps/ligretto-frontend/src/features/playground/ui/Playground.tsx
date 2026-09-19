import { useSelector } from 'react-redux'

import { playgroundDecksSelector } from '#ducks/game'
import { TableCards } from './TableCards'
import { PlaygroundDeck } from './PlaygroundDeck'

export const Playground = () => {
  const cardsDecks = useSelector(playgroundDecksSelector)
  return (
    <TableCards>
      {Array.from({ length: 12 }, (_, index) => (
        <PlaygroundDeck key={index} cardDeck={cardsDecks[index]} deckIndex={index} />
      ))}
    </TableCards>
  )
}
