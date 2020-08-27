import { inject, injectable } from 'inversify'
import { last } from 'lodash'
import { PlaygroundRepository } from './playground.repo'
import { Card, CardsDeck, Game } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

const isDeckAvailable = (deck: CardsDeck, card) => {
  const topCard: Card | undefined = last(deck.cards)
  console.log('isDeckAvailable', topCard, card)
  if (!topCard) {
    return card.value === 1
  }
  return topCard.color === card.color && topCard.value + 1 === card.value
}

@injectable()
export class PlaygroundService {
  @inject(IOC_TYPES.PlaygroundRepository) private playgroundRepository: PlaygroundRepository

  async getDecks(gameId: string) {
    return await this.playgroundRepository.getDecks(gameId)
  }

  async findAvailableDeckIndex(gameId: string, card: Card) {
    const decks = await this.getDecks(gameId)
    console.log('activeDecks', decks)
    return decks.findIndex(deck => isDeckAvailable(deck, card))
  }

  async putCard(gameId: string, card: Card, deckIndex: number) {
    console.log('putCard', deckIndex)
    await this.playgroundRepository.updateDeck(gameId, deckIndex, deck => {
      console.log('putCard deck', deck)

      if (isDeckAvailable(deck, card)) {
        return {
          ...deck,
          isHidden: card.value === 10,
          cards: [...deck.cards, card],
        }
      }
      return deck
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

  /**
   * Если deckPosition пришел, то проверяем, что туда можно положить карту.
   * Если не пришел, то ищем доступную колоду или создаем
   */
  async checkOrCreateDeck(gameId: Game['id'], card: Card, deckPosition?: number): Promise<number | undefined> {
    let finalDeckPosition
    if (deckPosition !== undefined) {
      if (await this.checkIsDeckAvailable(gameId, card, deckPosition)) {
        finalDeckPosition = deckPosition
      } else {
        return undefined
      }
    } else {
      finalDeckPosition = await this.findAvailableDeckIndex(gameId, card)

      if (finalDeckPosition === -1 && card.value === 1) {
        const updatedDecks = await this.createEmptyDeck(gameId)
        finalDeckPosition = updatedDecks.length - 1
      }
    }
    return finalDeckPosition
  }
}
