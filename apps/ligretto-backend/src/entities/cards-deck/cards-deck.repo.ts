/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable } from 'inversify'
import { range } from 'lodash'
import { Card } from './card'

@injectable()
export class CardsDeckRepository {
  private cards: Card[] = []

  getCards() {
    return this.cards
  }

  addCards(cards: Card[]) {
    this.cards.push(...cards)

    return this.cards
  }

  pushCard(card: Card) {
    this.cards.push(card)

    return card
  }

  popCard() {
    return this.cards.pop()
  }

  popCards(count = 1): Card[] {
    const popedCards = []

    for (const _ in range(count)) {
      const popedCard = this.popCard()
      popedCards.push(popedCard)
    }

    return popedCards
  }
}
