import { inject, injectable } from 'inversify'
import { last } from 'lodash'

import { PlaygroundRepository } from './playground.repo'
import { Card } from '../../types/card'

@injectable()
export class PlaygroundService {
  constructor(@inject(PlaygroundRepository) private playgroundRepository: PlaygroundRepository) {}

  async getAllDecks(gameId: string) {
    return await this.playgroundRepository.getDecks(gameId)
  }

  async getActiveDecks(gameId: string) {
    return (await this.playgroundRepository.getDecks(gameId)).filter(deck => !deck.isHidden)
  }

  async putCard(gameId: string, position: number, card: Card) {
    await this.playgroundRepository.updateDeck(gameId, position, deck => {
      const topCard = last(deck.cards)

      if (topCard.color === card.color && topCard.value + 1 === card.value) {
        return {
          ...deck,
          isHidden: card.value === 10,
          cards: [...deck.cards, card],
        }
      } else {
        throw new Error()
      }
    })
  }

  async cleanDeck(gameId: string, position: number) {
    await this.playgroundRepository.updateDeck(gameId, position, deck => {
      return {
        ...deck,
        isHidden: true,
      }
    })
  }
}
