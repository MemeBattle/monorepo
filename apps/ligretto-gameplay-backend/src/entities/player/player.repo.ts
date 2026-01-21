import { inject, injectable } from 'inversify'
import type { Card, CardsDeck, UUID, Player } from '@memebattle/ligretto-shared'
import { IDatabase } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

export interface IPlayerRepository {
  getPlayer(gameId: UUID, playerId: UUID): Promise<Player | undefined>
  getCards(gameId: UUID, playerId: UUID): Promise<(Card | null)[] | undefined>
  getCard(gameId: UUID, playerId: UUID, position: number): Promise<Card | null | undefined>
  addCard(gameId: UUID, playerId: UUID, card: Card, position: number): Promise<(Card | null)[] | undefined>
  removeCard(gameId: UUID, playerId: UUID, position: number): Promise<(Card | null)[] | undefined>
  getLigrettoDeck(gameId: UUID, playerId: UUID): Promise<CardsDeck | undefined>
  removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID): Promise<number | undefined>
  getStackDeck(gameId: UUID, playerId: UUID): Promise<CardsDeck | undefined>
  getStackOpenDeck(gameId: UUID, playerId: UUID): Promise<CardsDeck | undefined>
  removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID): Promise<Card | undefined>
  updateStackDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck): Promise<CardsDeck | undefined>
  updateStackOpenDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck): Promise<CardsDeck | undefined>
}

@injectable()
export class PlayerRepository implements IPlayerRepository {
  @inject(IOC_TYPES.IDatabase) private database: IDatabase

  async getPlayer(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId])
  }

  async getCards(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.cards)
  }

  async getCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.cards[position])
  }

  async addCard(gameId: UUID, playerId: UUID, card: Card, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.cards.splice(position, 1, card))
  }

  async removeCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.cards.splice(position, 1, null))
  }

  async getLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.ligrettoDeck)
  }

  async removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    await this.database.set(storage => storage.games[gameId].players[playerId]?.ligrettoDeck.cards.pop())

    return (await this.getLigrettoDeck(gameId, playerId))?.cards.length
  }

  async getStackDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.stackDeck)
  }

  async getStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.stackOpenDeck)
  }

  async removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.stackOpenDeck.cards.pop())
  }

  async updateStackDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackDeck(gameId, playerId)
    if (!deck) {
      return
    }
    return this.database.set(storage => {
      const player = storage.games[gameId].players[playerId]
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
      const player = storage.games[gameId].players[playerId]
      if (!player) {
        return
      }
      return (player.stackOpenDeck = updater(deck))
    })
  }
}
