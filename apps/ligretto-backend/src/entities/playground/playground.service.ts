import { inject, injectable } from 'inversify'
import { last } from 'lodash'
import { PlaygroundRepository } from './playground.repo'
import { Card } from '@memebattle/ligretto-shared'
import { TYPES } from '../../types'

@injectable()
export class PlaygroundService {
  @inject(TYPES.PlaygroundRepository) private playgroundRepository: PlaygroundRepository

  getAllDecks(gameId: string) {
    return this.playgroundRepository.getDecks(gameId)
  }

  async getActiveDecks(gameId: string) {
    return (await this.playgroundRepository.getDecks(gameId)).filter(deck => !deck.isHidden)
  }

  async findAvailableDeckIndex(gameId: string, card: Card) {
    const activeDecks = await this.getActiveDecks(gameId)
    console.log('activeDecks', activeDecks)
    return activeDecks.findIndex(deck => {
      const topCard: Card | undefined = last(deck.cards)
      console.log('findAvailableDeckIndex', topCard)
      return topCard.color === card.color && (topCard.value === card.value - 1 || (card.value === 1 && deck.cards.length === 0))
    })
  }

  async putCard(gameId: string, card: Card, deckIndex: number) {
    console.log('putCard', deckIndex)
    console.log('decks', await this.getAllDecks(gameId))
    await this.playgroundRepository.updateDeck(gameId, deckIndex, deck => {
      console.log('putCard deck', deck)
      const topCard: Card | undefined = last(deck.cards)

      if ((topCard === undefined && card.value === 1) || (topCard.color === card.color && topCard.value + 1 === card.value)) {
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
    await this.playgroundRepository.updateDeck(gameId, position, deck => ({
      ...deck,
      isHidden: true,
    }))
  }

  async checkIsDeckAvailable(gameId: string, card: Card, position: number) {
    const deck = await this.playgroundRepository.getDeck(gameId, position)
    const topCard: Card | undefined = last(deck.cards)
    if (deck.isHidden) {
      return false
    }
    if (topCard === undefined) {
      return card.value === 1
    }
    return topCard.value + 1 === card.value && topCard.color === card.color
  }

  async createEmptyDeck(gameId: string) {
    console.log('CreateEmptyDeck', gameId)
    const result = await this.playgroundRepository.addDeck(gameId, { cards: [], isHidden: false })
    console.log('CreateEmptyDeck', result)
    return result
  }
}
