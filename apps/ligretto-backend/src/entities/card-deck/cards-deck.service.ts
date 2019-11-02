/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { inject, injectable } from 'inversify'

import { Card } from '../../types'
import { CardsDeckRepository } from './card-deck.repo'
import { CardsRowRepository } from '../player/cards-row/cards-row.repo'

@injectable()
export class CardsDeckService {
  constructor(
    @inject(CardsDeckRepository) private cardsDeckRepository: CardsDeckRepository,
    @inject(CardsRowRepository) private cardsRowRepository: CardsDeckRepository,
  ) {}

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
