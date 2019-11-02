/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable } from 'inversify'
import { range, last } from 'lodash'
import { Card } from '../../types'
import { database } from '../../database/database'

@injectable()
export class CardsDeckRepository {
  async getCards(gameId: string, deckPosition: number) {
    return await database.get(storage => storage.games[gameId].playground.decks[deckPosition].cards)
  }

  getTopCard() {
    return last(this.cards);
  }

  pushCard(card: Card) {
    this.cards.push(card)

    return card
  }


  async putCardOnDeck(gameId: string, position: number, card: Card) {
    return await database.set((storage => {
      storage.games[gameId].playground.decks[position].cards.push(card)
    }))
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
