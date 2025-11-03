import { inject, injectable } from 'inversify'
import type { CardsDeck, UUID } from '@memebattle/ligretto-shared'
import { Database } from '../../database/database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlaygroundRepository {
  @inject(IOC_TYPES.Database) private database: Database

  getDecks(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.playground.decks)
  }

  getDeck(gameId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId]?.playground.decks?.[position])
  }

  addDroppedDeck(gameId: UUID, cardsDeck: CardsDeck) {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      const droppedDecks = game?.playground.droppedDecks

      if (!droppedDecks) {
        return
      }

      droppedDecks.push(cardsDeck)
      return droppedDecks
    })
  }

  removeDeck(gameId: UUID, position: number) {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      if (!game) {
        return
      }

      game.playground.decks[position] = null
    })
  }

  async updateDeck(gameId: UUID, position: number, updater: (deck: CardsDeck | null) => CardsDeck) {
    const deck = await this.getDeck(gameId, position)

    return this.database.set(storage => {
      const game = storage.games[gameId]
      if (!game) {
        return
      }

      const updated = updater(deck ?? null)
      console.log('Updated deck', position, updated)
      game.playground.decks[position] = updated
    })
  }
}
