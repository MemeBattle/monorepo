import { inject, injectable } from 'inversify'
import { last } from 'lodash'
import { IPlaygroundRepository } from './playground.repo'
import type { Card, CardsDeck, Game, UUID } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

export interface IPlaygroundService {
  putCard: (gameId: UUID, card: Card, deckIndex: number) => Promise<void>
  getAvailableDeckPosition: (gameId: Game['id'], card: Card, deckPosition?: number) => Promise<number | undefined>
}

const isDeckAvailable = (deck: CardsDeck | null, card: Card) => {
  const topCard: Card | undefined = last(deck?.cards)
  if (!topCard) {
    return card.value === 1
  }
  return topCard.color === card.color && topCard.value + 1 === card.value
}

@injectable()
export class PlaygroundService implements IPlaygroundService {
  @inject(IOC_TYPES.IPlaygroundRepository) private playgroundRepository: IPlaygroundRepository

  private async getDecks(gameId: UUID) {
    return await this.playgroundRepository.getDecks(gameId)
  }

  private async findAvailableDeckIndex(gameId: UUID, card: Card) {
    const decks = await this.getDecks(gameId)
    return decks.findIndex(deck => isDeckAvailable(deck, card))
  }

  async putCard(gameId: UUID, card: Card, deckIndex: number) {
    const deck = await this.playgroundRepository.getDeck(gameId, deckIndex)

    if (!isDeckAvailable(deck, card)) {
      return
    }

    await this.playgroundRepository.updateDeck(gameId, deckIndex, deck =>
      deck
        ? {
            ...deck,
            cards: [...deck?.cards, card],
          }
        : { cards: [card], isHidden: false },
    )
    if (card.value === 10) {
      const updatedDeck = await this.playgroundRepository.getDeck(gameId, deckIndex)

      if (updatedDeck) {
        await this.playgroundRepository.addDroppedDeck(gameId, updatedDeck)
        await this.playgroundRepository.removeDeck(gameId, deckIndex)
      }
    }
  }

  private async checkIsDeckAvailable(gameId: UUID, card: Card, position: number) {
    const deck = await this.playgroundRepository.getDeck(gameId, position)
    const topCard: Card | undefined = last(deck?.cards)

    if (!deck) {
      return true
    }

    if (topCard === undefined) {
      return card.value === 1
    }

    return topCard.value + 1 === card.value && topCard.color === card.color
  }

  /**
   * if deckPosition passed, check this deck
   * else find available deck position
   */
  async getAvailableDeckPosition(gameId: Game['id'], card: Card, deckPosition?: number): Promise<number | undefined> {
    let finalDeckPosition: number | undefined
    if (deckPosition !== undefined) {
      finalDeckPosition = (await this.checkIsDeckAvailable(gameId, card, deckPosition)) ? deckPosition : undefined
    } else {
      finalDeckPosition = await this.findAvailableDeckIndex(gameId, card)
    }

    return finalDeckPosition
  }
}
