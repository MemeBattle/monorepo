import { inject, injectable } from 'inversify'
import type { Card, CardsDeck, UUID } from '@memebattle/ligretto-shared'
import { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerRepository {
  @inject(IOC_TYPES.Database) private database: Database

  async getPlayer(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId])
  }

  async getCards(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId].cards)
  }

  async getCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId].players[playerId].cards[position])
  }

  async addCard(gameId: UUID, playerId: UUID, card: Card, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId].cards.splice(position, 1, card))
  }

  async removeCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId].cards.splice(position, 1, null))
  }

  async getLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId].ligrettoDeck)
  }

  async removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    await this.database.set(storage => storage.games[gameId].players[playerId].ligrettoDeck.cards.pop())

    return (await this.getLigrettoDeck(gameId, playerId)).cards.length
  }

  async getStackDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.stackDeck)
  }

  async getStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId].stackOpenDeck)
  }

  async removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.set(storage => storage.games[gameId].players[playerId].stackOpenDeck.cards.pop())
  }

  async updateCard(gameId: UUID, playerId: UUID, position: number, updater: (card: Card | null) => Card) {
    const card = await this.getCard(gameId, playerId, position)
    return this.database.set(storage => (storage.games[gameId].players[playerId].cards[position] = updater(card)))
  }

  async updateLigrettoDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getLigrettoDeck(gameId, playerId)
    return this.database.set(storage => (storage.games[gameId].players[playerId].ligrettoDeck = updater(deck)))
  }

  async updateStackDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackDeck(gameId, playerId)
    return this.database.set(storage => (storage.games[gameId].players[playerId].stackDeck = updater(deck)))
  }

  async updateStackOpenDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackOpenDeck(gameId, playerId)
    return this.database.set(storage => (storage.games[gameId].players[playerId].stackOpenDeck = updater(deck)))
  }
}
