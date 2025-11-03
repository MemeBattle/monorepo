import { inject, injectable } from 'inversify'
import type { Card, CardsDeck, UUID } from '@memebattle/ligretto-shared'
import { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerRepository {
  @inject(IOC_TYPES.Database) private database: Database

  async getPlayer(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId])
  }

  async getCards(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId]?.cards)
  }

  async getCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId]?.cards?.[position])
  }

  async addCard(gameId: UUID, playerId: UUID, card: Card, position: number) {
    return this.database.set(storage => {
      const player = storage.games[gameId]?.players?.[playerId]
      const cards = player?.cards

      if (!cards) {
        return
      }

      return cards.splice(position, 1, card)
    })
  }

  async removeCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.set(storage => {
      const player = storage.games[gameId]?.players?.[playerId]
      const cards = player?.cards

      if (!cards) {
        return
      }

      return cards.splice(position, 1, null)
    })
  }

  async getLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId]?.ligrettoDeck)
  }

  async removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    await this.database.set(storage => storage.games[gameId]?.players?.[playerId]?.ligrettoDeck?.cards.pop())

    return (await this.getLigrettoDeck(gameId, playerId))?.cards.length
  }

  async getStackDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId]?.stackDeck)
  }

  async getStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId]?.players?.[playerId]?.stackOpenDeck)
  }

  async removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.set(storage => storage.games[gameId]?.players?.[playerId]?.stackOpenDeck?.cards.pop())
  }

  async updateStackDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackDeck(gameId, playerId)
    if (!deck) {
      return
    }
    return this.database.set(storage => {
      const player = storage.games[gameId]?.players?.[playerId]
      if (!player) {
        return
      }
      return (player.stackDeck = updater(deck))
    })
  }

  async updateStackOpenDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackOpenDeck(gameId, playerId)
    if (!deck) {
      return
    }
    return this.database.set(storage => {
      const player = storage.games[gameId]?.players?.[playerId]
      if (!player) {
        return
      }
      return (player.stackOpenDeck = updater(deck))
    })
  }
}
