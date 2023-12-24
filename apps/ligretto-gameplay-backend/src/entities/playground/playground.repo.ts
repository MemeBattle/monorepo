import { inject, injectable } from 'inversify'
import type { CardsDeck, UUID } from '@memebattle/ligretto-shared'
import { IDatabase } from '../../database/database'
import { IOC_TYPES } from '../../IOC_TYPES'

export interface IPlaygroundRepository {
  getDecks(gameId: UUID): Promise<(CardsDeck | null)[]>
  getDeck(gameId: UUID, position: number): Promise<CardsDeck | null>
  addDroppedDeck(gameId: UUID, cardsDeck: CardsDeck): Promise<CardsDeck[]>
  removeDeck(gameId: UUID, position: number): Promise<void>
  updateDeck(gameId: UUID, position: number, updater: (deck: CardsDeck | null) => CardsDeck): Promise<void>
}

@injectable()
export class PlaygroundRepository implements IPlaygroundRepository {
  @inject(IOC_TYPES.IDatabase) private database: IDatabase

  getDecks(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId].playground.decks)
  }

  getDeck(gameId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId].playground.decks[position])
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
      storage.games[gameId].playground.decks[position] = null
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
