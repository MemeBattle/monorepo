import { Card } from './card'
import { CardsDeck } from './cards-deck'

export interface Player {
  user: string,
  cards: Card[],
  ligrettoDeck: CardsDeck,
  stackOpenDeck: CardsDeck,
  stackDeck: CardsDeck,
}
