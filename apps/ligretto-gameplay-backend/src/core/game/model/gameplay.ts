import type { Card, Game, Player, Playground, UUID } from '@memebattle/ligretto-shared'
import { canPlaceCardOnDeck, CardColors, GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

export const shuffled = <T>(items: readonly T[]): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

const CARD_VALUES = Array.from({ length: 10 }, (_, index) => index + 1)

export const createInitialPlayerCards = (playerId: string): Card[] =>
  shuffled(
    [CardColors.red, CardColors.blue, CardColors.green, CardColors.yellow].flatMap(color => CARD_VALUES.map(value => ({ value, color, playerId }))),
  )

/** 5 cards in a row for 2 players, 4 for 3, 3 for 4 and more. */
const cardsInRowFor = (playersCount: number) => (playersCount >= 4 ? 3 : 7 - playersCount)

const LIGRETTO_DECK_SIZE = 10

export type Hand = Pick<Player, 'cards' | 'ligrettoDeck' | 'stackOpenDeck' | 'stackDeck'>

export const dealHand = (playerId: UUID, playersCount: number): Hand => {
  const cards = createInitialPlayerCards(playerId)
  const cardsInRow = cardsInRowFor(playersCount)
  return {
    cards: cards.slice(0, cardsInRow),
    ligrettoDeck: { cards: cards.slice(cardsInRow, cardsInRow + LIGRETTO_DECK_SIZE), isHidden: true },
    stackOpenDeck: { cards: [], isHidden: false },
    stackDeck: { cards: cards.slice(cardsInRow + LIGRETTO_DECK_SIZE), isHidden: true },
  }
}

/** The cards a player got rid of minus twice what is left in their ligretto deck. */
export const scoreOf = (playground: Playground, player: Player) => {
  const placed = [...playground.decks, ...playground.droppedDecks].flatMap(deck => deck?.cards ?? []).filter(card => card.playerId === player.id)
  return placed.length - 2 * player.ligrettoDeck.cards.length
}

export const emptyTable = (maxCardsOnTable: number): Playground => ({ decks: new Array<null>(maxCardsOnTable).fill(null), droppedDecks: [] })

export const checkIsDeckAvailable = (playground: Playground, card: Card, position: number) =>
  Number.isInteger(position) && position >= 0 && position < playground.decks.length && canPlaceCardOnDeck(card, playground.decks[position])

/** The caller has checked `checkIsDeckAvailable`. A ten completes its deck, which leaves the table. */
export const placeCard = (playground: Playground, card: Card, position: number): Playground => {
  const current = playground.decks[position]
  const deck = current ? { ...current, cards: [...current.cards, card] } : { cards: [card], isHidden: false }
  const completed = card.value === 10
  return {
    decks: playground.decks.map((existing, index) => (index === position ? (completed ? null : deck) : existing)),
    droppedDecks: completed ? [...playground.droppedDecks, deck] : playground.droppedDecks,
  }
}

export const canMutateGameplay = (game: Game, userId: UUID) => {
  const player = game.players[userId]
  return game.status === GameStatus.InGame && !!player && player.status !== PlayerStatus.Disconnected
}

const withPlayer = (game: Game, player: Player): Game => ({ ...game, players: { ...game.players, [player.id]: player } })

export const putCard = (game: Game, playerId: UUID, cardIndex: number, deckIndex: number): Game => {
  const player = game.players[playerId]
  const card = Number.isInteger(cardIndex) ? player?.cards[cardIndex] : undefined
  if (!player || !card || !checkIsDeckAvailable(game.playground, card, deckIndex)) {
    return game
  }
  return {
    ...withPlayer(game, { ...player, cards: player.cards.map((current, index) => (index === cardIndex ? null : current)) }),
    playground: placeCard(game.playground, card, deckIndex),
  }
}

export const putCardFromStackOpenDeck = (game: Game, playerId: UUID, deckIndex: number): Game => {
  const player = game.players[playerId]
  const card = player?.stackOpenDeck.cards.at(-1)
  if (!player || !card || !checkIsDeckAvailable(game.playground, card, deckIndex)) {
    return game
  }
  return {
    ...withPlayer(game, { ...player, stackOpenDeck: { ...player.stackOpenDeck, cards: player.stackOpenDeck.cards.slice(0, -1) } }),
    playground: placeCard(game.playground, card, deckIndex),
  }
}

/** `remaining` is the ligretto deck after the move; the round ends when it reaches zero. */
export const takeFromLigrettoDeck = (game: Game, playerId: UUID): { game: Game; remaining?: number } => {
  const player = game.players[playerId]
  if (!player) {
    return { game }
  }
  const { cards: deck } = player.ligrettoDeck
  const emptySlot = player.cards.indexOf(null)
  if (emptySlot === -1) {
    return { game, remaining: deck.length }
  }
  const card = deck.at(-1)
  if (!card) {
    return { game }
  }
  return {
    game: withPlayer(game, {
      ...player,
      cards: player.cards.map((current, index) => (index === emptySlot ? card : current)),
      ligrettoDeck: { ...player.ligrettoDeck, cards: deck.slice(0, -1) },
    }),
    remaining: deck.length - 1,
  }
}

const TAKEN_FROM_STACK = 3

export const takeFromStackDeck = (game: Game, playerId: UUID): Game => {
  const player = game.players[playerId]
  if (!player) {
    return game
  }
  const isStackEmpty = player.stackDeck.cards.length === 0
  const stack = isStackEmpty ? shuffled(player.stackOpenDeck.cards) : player.stackDeck.cards
  const open = isStackEmpty ? [] : player.stackOpenDeck.cards
  const rest = stack.slice(0, -TAKEN_FROM_STACK)
  return withPlayer(game, {
    ...player,
    stackDeck: { isHidden: rest.length !== 0, cards: rest },
    stackOpenDeck: { ...player.stackOpenDeck, cards: open.concat(stack.slice(-TAKEN_FROM_STACK)) },
  })
}
