import { inject, injectable } from 'inversify'
import { last } from 'lodash'
import type { PlaygroundRepository } from './playground.repo'
import type { Card, CardsDeck, Game, UUID } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

const isDeckAvailable = (deck: CardsDeck | null, card: Card) => {
  const topCard: Card | undefined = last(deck?.cards)
  if (!topCard) {
    return card.value === 1
  }
  return topCard.color === card.color && topCard.value + 1 === card.value
}

@injectable()
export class PlaygroundService {
  @inject(IOC_TYPES.PlaygroundRepository) private playgroundRepository: PlaygroundRepository

  getDecks(gameId: UUID) {
    return this.playgroundRepository.getDecks(gameId)
  }

  findAvailableDeckIndex(gameId: UUID, card: Card) {
    const decks = this.getDecks(gameId)
    return decks.findIndex(deck => isDeckAvailable(deck, card))
  }

  putCard(gameId: UUID, card: Card, deckIndex: number) {
    const deck = this.playgroundRepository.getDeck(gameId, deckIndex)

    if (!isDeckAvailable(deck, card)) {
      return
    }

    this.playgroundRepository.updateDeck(gameId, deckIndex, deck =>
      deck
        ? {
            ...deck,
            cards: [...deck?.cards, card],
          }
        : { cards: [card], isHidden: false },
    )
    if (card.value === 10) {
      const updatedDeck = this.playgroundRepository.getDeck(gameId, deckIndex)

      if (updatedDeck) {
        this.playgroundRepository.addDroppedDeck(gameId, updatedDeck)
        this.playgroundRepository.removeDeck(gameId, deckIndex)
      }
    }
  }

  checkIsDeckAvailable(gameId: UUID, card: Card, position: number) {
    const deck = this.playgroundRepository.getDeck(gameId, position)
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
  getAvailableDeckPosition(gameId: Game['id'], card: Card, deckPosition?: number): number | undefined {
    let finalDeckPosition: number | undefined
    if (deckPosition !== undefined) {
      finalDeckPosition = this.checkIsDeckAvailable(gameId, card, deckPosition) ? deckPosition : undefined
    } else {
      finalDeckPosition = this.findAvailableDeckIndex(gameId, card)
    }

    return finalDeckPosition
  }
}
