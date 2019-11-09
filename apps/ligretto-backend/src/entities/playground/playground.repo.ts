/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable } from 'inversify'
import { CardsDeck } from '../../types/cards-deck'
import { database } from '../../database/database'

@injectable()
export class PlaygroundRepository {
  async getDecks(gameId: string) {
    return database.get(storage => storage.games[gameId].playground.decks)
  }

  async getDeck(gameId: string, position: number) {
    return database.get(storage => storage.games[gameId].playground.decks[position])
  }

  async addDeck(gameId: string, cardsDeck: CardsDeck) {
    return database.set(storage => {
      storage.games[gameId].playground.decks.push(cardsDeck)
    })
  }

  async removeDeck(gameId: string, position: number) {
    return database.set(storage => {
      delete storage.games[gameId].playground.decks[position]
    })
  }

  async updateDeck(gameId: string, position: number, updater: (deck: CardsDeck) => CardsDeck) {
    const deck = await this.getDeck(gameId, position)

    return database.set(storage => {
      storage.games[gameId].playground.decks[position] = updater(deck)
    })
  }
}
