/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable } from 'inversify'
import { Card, CardsDeck } from '../../types'
import { database } from '../../database/database'

@injectable()
export class PlayerRepository {
  async getPlayer(gameId: string, color: string) {
    return database.get(storage => storage.games[gameId].players[color])
  }

  async getCards(gameId: string, color: string) {
    return database.get(storage => storage.games[gameId].players[color].cards)
  }

  async getCard(gameId: string, color: string, position: number) {
    return database.get(storage => storage.games[gameId].players[color].cards[position])
  }

  async addCard(gameId: string, color: string, card: Card) {
    return database.set(storage => storage.games[gameId].players[color].cards.push(card))
  }

  async removeCard(gameId: string, color: string, position: number) {
    return database.set(storage => storage.games[gameId].players[color].cards.splice(position, 1))
  }

  async getLigrettoDeck(gameId: string, color: string) {
    return database.get(storage => storage.games[gameId].players[color].ligrettoDeck)
  }

  async removeCardFromLigrettoDeck(gameId: string, color: string) {
    await database.set(storage => storage.games[gameId].players[color].ligrettoDeck.cards.pop())

    return (await this.getLigrettoDeck(gameId, color)).cards.length
  }

  async getStackDeck(gameId: string, color: string) {
    return database.get(storage => storage.games[gameId].players[color].stackDeck)
  }

  async getStackOpenDeck(gameId: string, color: string) {
    return database.get(storage => storage.games[gameId].players[color].stackOpenDeck)
  }

  async removeCardFromStackOpenDeck(gameId: string, color: string) {
    return database.set(storage => storage.games[gameId].players[color].stackOpenDeck.cards.pop())
  }

  async updateCard(gameId: string, color: string, position: number, updater: (card: Card) => Card) {
    const card = await this.getCard(gameId, color, position)
    return database.set(storage => (storage.games[gameId].players[color].cards[position] = updater(card)))
  }

  async updateLigrettoDeck(gameId: string, color: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getLigrettoDeck(gameId, color)
    return database.set(storage => (storage.games[gameId].players[color].ligrettoDeck = updater(deck)))
  }

  async updateStackDeck(gameId: string, color: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackDeck(gameId, color)
    return database.set(storage => (storage.games[gameId].players[color].stackDeck = updater(deck)))
  }

  async updateStackOpenDeck(gameId: string, color: string, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = await this.getStackOpenDeck(gameId, color)
    return database.set(storage => (storage.games[gameId].players[color].stackOpenDeck = updater(deck)))
  }
}
