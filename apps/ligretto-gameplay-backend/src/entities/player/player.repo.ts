import { inject, injectable } from 'inversify'
import type { Card, CardsDeck, UUID } from '@memebattle/ligretto-shared'
import type { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerRepository {
  @inject(IOC_TYPES.Database) private database: Database

  getPlayer(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId])
  }

  getCards(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.cards)
  }

  getCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.cards[position])
  }

  addCard(gameId: UUID, playerId: UUID, card: Card, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.cards.splice(position, 1, card))
  }

  removeCard(gameId: UUID, playerId: UUID, position: number) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.cards.splice(position, 1, null))
  }

  getLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.ligrettoDeck)
  }

  removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    this.database.set(storage => storage.games[gameId].players[playerId]?.ligrettoDeck.cards.pop())

    return this.getLigrettoDeck(gameId, playerId)?.cards.length
  }

  getStackDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.stackDeck)
  }

  getStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.get(storage => storage.games[gameId].players[playerId]?.stackOpenDeck)
  }

  removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    return this.database.set(storage => storage.games[gameId].players[playerId]?.stackOpenDeck.cards.pop())
  }

  updateStackDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = this.getStackDeck(gameId, playerId)
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

  updateStackOpenDeck(gameId: UUID, playerId: UUID, updater: (cardsDeck: CardsDeck) => CardsDeck) {
    const deck = this.getStackOpenDeck(gameId, playerId)
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
