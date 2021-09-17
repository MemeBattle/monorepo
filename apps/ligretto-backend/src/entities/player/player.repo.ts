import { inject, injectable } from 'inversify'
import type { Card, CardsDeck } from '@memebattle/ligretto-shared'
import { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerRepository {
  @inject(IOC_TYPES.Database) private database: Database

  async getPlayer(gameId: string, player: string) {
    return this.database.get(storage => storage.games[gameId].players[player])
  }

  async getCards(gameId: string, player: string) {
    return this.database.get(storage => storage.games[gameId].players[player].cards)
  }

  async getCard(gameId: string, player: string, position: number) {
    return this.database.get(storage => storage.games[gameId].players[player].cards[position])
  }

  async addCard(gameId: string, player: string, card: Card, position: number) {
    return this.database.set(storage => storage.games[gameId].players[player].cards.splice(position, 1, card))
  }

  async removeCard(gameId: string, player: string, position: number) {
    return this.database.set(storage => storage.games[gameId].players[player].cards.splice(position, 1, null))
  }

  async getLigrettoDeck(gameId: string, player: string) {
    return this.database.get(storage => storage.games[gameId].players[player].ligrettoDeck)
  }

  async removeCardFromLigrettoDeck(gameId: string, player: string) {
    await this.database.set(storage => storage.games[gameId].players[player].ligrettoDeck.cards.pop())

    return (await this.getLigrettoDeck(gameId, player)).cards.length
  }

  async getStackDeck(gameId: string, player: string) {
    return this.database.get(storage => storage.games[gameId].players[player].stackDeck)
  }

  async getStackOpenDeck(gameId: string, player: string) {
    return this.database.get(storage => storage.games[gameId].players[player].stackOpenDeck)
  }

  async removeCardFromStackOpenDeck(gameId: string, player: string) {
    return this.database.set(storage => storage.games[gameId].players[player].stackOpenDeck.cards.pop())
  }

  async updateCard(gameId: string, player: string, position: number, updater: (card: Card) => Card) {
    const card = await this.getCard(gameId, player, position)
    return this.database.set(storage => (storage.games[gameId].players[player].cards[position] = updater(card)))
  }

  async updateLigrettoDeck(gameId: string, player: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getLigrettoDeck(gameId, player)
    return this.database.set(storage => (storage.games[gameId].players[player].ligrettoDeck = updater(deck)))
  }

  async updateStackDeck(gameId: string, player: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackDeck(gameId, player)
    return this.database.set(storage => (storage.games[gameId].players[player].stackDeck = updater(deck)))
  }

  async updateStackOpenDeck(gameId: string, player: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackOpenDeck(gameId, player)
    return this.database.set(storage => (storage.games[gameId].players[player].stackOpenDeck = updater(deck)))
  }
}
