import type { Card, CardsDeck } from './types'

export const canPlaceCardOnDeck = (card: Card, deck: CardsDeck | null | undefined): boolean => {
  if (deck === undefined) {
    return false
  }
  const topCard = deck?.cards[deck.cards.length - 1]

  if (!topCard) {
    return card.value === 1
  }

  return topCard.color === card.color && topCard.value + 1 === card.value
}
