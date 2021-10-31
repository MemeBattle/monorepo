import { inject, injectable } from 'inversify'
import type { CardsDeck } from '@memebattle/ligretto-shared'
import { Database } from '../../database/database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlaygroundRepository {
  @inject(IOC_TYPES.Database) private database: Database

  getDecks(gameId: string) {
    return this.database.get(storage => storage.games[gameId].playground.decks)
  }
// Добавить новые методы для новой колоды

  getDeck(gameId: string, position: number) {
    return this.database.get(storage => storage.games[gameId].playground.decks[position])
  }
  getDroppedDecks(gameId: string, position: number) {
    return this.database.get(storage => storage.games[gameId].playground.droppedDecks[position])
  }

  addDeck(gameId: string, cardsDeck: CardsDeck) {
    return this.database.set(storage => {
      const decks = storage.games[gameId].playground.decks
      decks.push(cardsDeck)
      return decks
    })
  }
  addDroppedDeck(gameId: string, cardsDeck: CardsDeck) {
    return this.database.set(storage => {
      const decks = storage.games[gameId].playground.droppedDecks
      decks.push(cardsDeck)
      return decks
    })
  }

  removeDeck(gameId: string, position: number) {
    return this.database.set(storage => {
      delete storage.games[gameId].playground.decks[position]
    })
  }

  removeDroppedDeck(gameId: string, position: number) {
    return this.database.set(storage => {
      delete storage.games[gameId].playground.droppedDecks[position]
    })
  }

  async updateDeck(gameId: string, position: number, updater: (deck: CardsDeck) => CardsDeck) {
    const deck = await this.getDeck(gameId, position)

    return this.database.set(storage => {
      const updated = updater(deck)
      console.log('Updated deck', position, updated)
      storage.games[gameId].playground.decks[position] = updated
    })
  }

  async updateDroppedDeck(gameId: string, position: number, updater: (deck: CardsDeck) => CardsDeck) {
    const deck = await this.getDeck(gameId, position)

    return this.database.set(storage => {
      const updated = updater(deck)
      console.log('Updated deck', position, updated)
      storage.games[gameId].playground.droppedDecks[position] = updated
    })
  }
}
