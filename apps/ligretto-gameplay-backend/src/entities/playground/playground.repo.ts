import { inject, injectable } from 'inversify'
import type { CardsDeck, UUID } from '@memebattle/ligretto-shared'
import { Database } from '../../database/database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlaygroundRepository {
  @inject(IOC_TYPES.Database) private database: Database

  getDecks(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId].playground.decks)
  }

  getDeck(gameId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId].playground.decks[position])
  }

  addDeck(gameId: UUID, cardsDeck: CardsDeck) {
    return this.database.set(storage => {
      const decks = storage.games[gameId].playground.decks
      decks.push(cardsDeck)
      return decks
    })
  }

  addDroppedDeck(gameId: UUID, cardsDeck: CardsDeck) {
    return this.database.set(storage => {
      const decks = storage.games[gameId].playground.droppedDecks
      decks.push(cardsDeck)
      return decks
    })
  }

  removeDeck(gameId: UUID, position: number) {
    return this.database.set(storage => {
      delete storage.games[gameId].playground.decks[position]
    })
  }

  async updateDeck(gameId: UUID, position: number, updater: (deck: CardsDeck | null) => CardsDeck) {
    const deck = await this.getDeck(gameId, position)

    return this.database.set(storage => {
      const updated = updater(deck)
      console.log('Updated deck', position, updated)
      storage.games[gameId].playground.decks[position] = updated
    })
  }
}
