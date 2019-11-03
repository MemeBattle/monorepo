/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { inject, injectable } from 'inversify'

import { Card } from '../../types'
import { PlaygroundRepository } from './playground.repo'

@injectable()
export class PlaygroundService {
  constructor(@inject(PlaygroundRepository) private cardsDeskRepository: PlaygroundRepository) {}

  putCard(card: Card, position: number) {
    if (card.value === 1) {
      this.cardsDeskRepository.
    }

    const currentCard = this.cardsDeskRepository.getCardDeck(position)
    const topCard = currentCard.getTopCard()

    if (currentCard && card.value - topCard.value === 1) {
      this.cardsDeskRepository.putCardOnDeck(card, position)
    }
  }

  removeDeck(position) {
    this.cardsDeskRepository.removeCardDeck(position);
  }
}
