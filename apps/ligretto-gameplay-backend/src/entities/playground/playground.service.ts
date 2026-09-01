import { inject, injectable } from 'inversify'
import type { PlaygroundRepository } from './playground.repo'
import type { Card, UUID } from '@memebattle/ligretto-shared'
import { canPlaceCardOnDeck } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlaygroundService {
  @inject(IOC_TYPES.PlaygroundRepository) private playgroundRepository: PlaygroundRepository

  getDecks(gameId: UUID) {
    return this.playgroundRepository.getDecks(gameId)
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
}
