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
    [positionConfig.stackOpenDeck]: { ...opponent.stackOpenDeck.cards[0], isHidden: opponent.stackOpenDeck.isHidden },
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
  [CardPositions.q]: { ...player.stackOpenDeck.cards[0], hidden: player.stackOpenDeck.isHidden },
  [CardPositions.w]: { ...player.stackDeck.cards[0], hidden: player.stackDeck.isHidden },
  [CardPositions.e]: player.cards[0],
  [CardPositions.r]: player.cards[1],
  [CardPositions.t]: player.cards[2],
  [CardPositions.y]: { ...player.ligrettoDeck.cards[0], hidden: true },
})
