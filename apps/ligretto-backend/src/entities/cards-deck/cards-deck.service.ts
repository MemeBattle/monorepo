import { inject, injectable } from 'inversify'

import { Card } from './card'
import { CardsDeckRepository } from './cards-deck.repo'

@injectable()
export class CardsDeckService {
  constructor(@inject(CardsDeckRepository) private cardsDeckRepository: CardsDeckRepository) {}

  initCards(cards: Card[]) {
    this.cardsDeckRepository.addCards(cards)
  }

  getCards() {
    return this.cardsDeckRepository.getCards()
  }

  addCard(card: Card) {
    return this.cardsDeckRepository.pushCard(card)
  }

  drawCard() {
    return this.cardsDeckRepository.popCard()
  }
}
