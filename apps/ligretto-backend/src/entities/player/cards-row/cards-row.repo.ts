/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Card } from '../../playground'
import { injectable } from 'inversify'

type RowPositions = [1, 2, 3, 4, 5]
type RowPosition = RowPositions[number]

type CardsInRow = {
  [position in RowPosition]?: Card
}

@injectable()
export class CardsRowRepository {
  private cards: CardsInRow = {}

  addCard(card: Card, position: RowPosition) {
    this.cards[position] = card
  }

  removeCard(position: RowPosition) {
    const card = this.cards[position]
    delete this.cards[position]
    return card
  }

  getCards() {
    return this.cards
  }
}
