/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { inject, injectable } from 'inversify'
import { range } from 'lodash'
import { Card, CardsDeck } from '../../types'
import { CardsDeckRepository } from '../playground'
import { database } from '../../database/database'

@injectable()
export class PlaygroundRepository {
  async getCardsDecks(gameId: string) {
    return await database.get((storage => storage.games[gameId].playground.decks));
  }

  async getCardDeck(gameId: string, position: number) {
    return await database.get((storage => storage.games[gameId].playground.decks[position]))
  }

  async pushCardDeck(gameId: string, cardsDeck: CardsDeck) {
    return await database.set((storage => {
      storage.games[gameId].playground.decks.push(cardsDeck)
    }))
  }

  async removeCardDeck(gameId: string, position: number) {
    return await database.set((storage => {
      delete storage.games[gameId].playground.decks[position]
    }))
  }
}
