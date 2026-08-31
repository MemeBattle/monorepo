import { inject, injectable } from 'inversify'
import type { PlaygroundRepository } from './playground.repo'
import type { Card, Game, UUID } from '@memebattle/ligretto-shared'
import { canPlaceCardOnDeck } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlaygroundService {
  @inject(IOC_TYPES.PlaygroundRepository) private playgroundRepository: PlaygroundRepository

  getDecks(gameId: UUID) {
    return this.playgroundRepository.getDecks(gameId)
  }

  findAvailableDeckIndex(gameId: UUID, card: Card) {
    const decks = this.getDecks(gameId)
    return decks.findIndex(deck => canPlaceCardOnDeck(card, deck))
  }

  putCard(gameId: UUID, card: Card, deckIndex: number) {
    const deck = this.playgroundRepository.getDeck(gameId, deckIndex)

    if (!canPlaceCardOnDeck(card, deck)) {
      return false
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
    return true
  }

  checkIsDeckAvailable(gameId: UUID, card: Card, position: number) {
    const deck = this.playgroundRepository.getDeck(gameId, position)
    return canPlaceCardOnDeck(card, deck)
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
