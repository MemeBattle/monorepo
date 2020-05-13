import { Card, CardPositions, OpponentPositions, Player } from '@memebattle/ligretto-shared'

const positionConfigByOpponentPositions = {
  [OpponentPositions.Left]: {
    stackOpenDeck: CardPositions.l0,
    cards: [CardPositions.l1, CardPositions.l2, CardPositions.l3],
  },
  [OpponentPositions.Right]: {
    stackOpenDeck: CardPositions.r0,
    cards: [CardPositions.r1, CardPositions.r2, CardPositions.r2],
  },
  [OpponentPositions.Top]: {
    stackOpenDeck: CardPositions.o0,
    cards: [CardPositions.o1, CardPositions.o2, CardPositions.o3],
  },
}

/**
 * Extract cards from opponent player to card position by playerPosition
 *
 * @param opponent - opponent
 * @param position - opponent position
 * @return cards - object with cards by card position
 */
export const opponentToCardsMapper = (opponent: Player, position: OpponentPositions): Partial<Record<CardPositions, Card>> => {
  const positionConfig = positionConfigByOpponentPositions[position]
  const cardsByPosition: Partial<Record<CardPositions, Card>> = {
    [positionConfig.stackOpenDeck]: opponent.stackOpenDeck.cards[0],
  }
  positionConfig.cards.forEach((cardPosition, index) => {
    cardsByPosition[cardPosition] = opponent.cards[index]
  })
  return cardsByPosition
}

/**
 * Extract cards from player to card position
 *
 * @param player
 */
export const playerToCardsMapper = (player: Player): Partial<Record<CardPositions, Card>> => ({
  [CardPositions.q]: player.stackOpenDeck.cards[0],
  [CardPositions.w]: player.cards[0],
  [CardPositions.e]: player.cards[1],
  [CardPositions.r]: player.cards[2],
})
