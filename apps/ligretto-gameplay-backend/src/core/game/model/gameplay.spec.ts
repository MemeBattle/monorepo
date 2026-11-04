import { describe, expect, it } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, type Card, type Game, type Player, type Playground } from '@memebattle/ligretto-shared'
import {
  canMutateGameplay,
  checkIsDeckAvailable,
  createInitialPlayerCards,
  dealHand,
  emptyTable,
  placeCard,
  putCard,
  putCardFromStackOpenDeck,
  scoreOf,
  takeFromLigrettoDeck,
  takeFromStackDeck,
} from './gameplay'
import { createGame } from './room'

const card = (value: number, color = CardColors.red, playerId = 'host'): Card => ({ value, color, playerId })

const deck = (...cards: Card[]) => ({ isHidden: false, cards })

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.InGame,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

const table = (decks: Playground['decks'], droppedDecks: Playground['droppedDecks'] = []): Playground => ({ decks, droppedDecks })

const game = (host: Partial<Player> = {}, playground: Playground = emptyTable(3)): Game => ({
  ...createGame('game', 'Room'),
  status: GameStatus.InGame,
  players: { host: player('host', host) },
  playground,
})

const key = ({ color, value }: Card) => `${color}${value}`

describe('createInitialPlayerCards', () => {
  it('gives a player all forty cards of their deck', () => {
    const cards = createInitialPlayerCards('host')

    expect(cards).toHaveLength(40)
    expect(new Set(cards.map(key)).size).toBe(40)
    expect(cards.every(current => current.playerId === 'host' && current.value >= 1 && current.value <= 10)).toBe(true)
  })
})

describe('dealHand', () => {
  it.each([
    [2, 5],
    [3, 4],
    [4, 3],
    [5, 3],
  ])('deals %i players %i cards in a row', (playersCount, cardsInRow) => {
    const hand = dealHand('host', playersCount)

    expect(hand.cards).toHaveLength(cardsInRow)
    expect(hand.ligrettoDeck).toEqual({ isHidden: true, cards: expect.any(Array) })
    expect(hand.ligrettoDeck.cards).toHaveLength(10)
    expect(hand.stackDeck.isHidden).toBe(true)
    expect(hand.stackDeck.cards).toHaveLength(30 - cardsInRow)
    expect(hand.stackOpenDeck).toEqual({ isHidden: false, cards: [] })
  })

  it('deals every card exactly once', () => {
    const { cards, ligrettoDeck, stackDeck } = dealHand('host', 2)
    const all = [...(cards as Card[]), ...ligrettoDeck.cards, ...stackDeck.cards]

    expect(new Set(all.map(key)).size).toBe(40)
  })
})

describe('scoreOf', () => {
  it('counts the cards a player placed, on the table and in dropped decks, minus twice the ligretto deck', () => {
    const playground = table([deck(card(1), card(2, CardColors.red, 'peer')), null, deck(card(1, CardColors.blue))], [deck(card(10))])

    expect(scoreOf(playground, player('host', { ligrettoDeck: { isHidden: true, cards: [card(5)] } }))).toBe(1)
  })

  it('gives a player with nothing placed and an empty ligretto deck zero', () => {
    expect(scoreOf(emptyTable(3), player('host'))).toBe(0)
  })
})

describe('emptyTable', () => {
  it('has a free slot for every deck the table holds', () => {
    expect(emptyTable(3)).toEqual({ decks: [null, null, null], droppedDecks: [] })
  })
})

describe('checkIsDeckAvailable', () => {
  const playground = table([null, deck(card(1))])

  it('takes a one on a free slot', () => {
    expect(checkIsDeckAvailable(playground, card(1), 0)).toBe(true)
  })

  it('takes the next card of the same colour', () => {
    expect(checkIsDeckAvailable(playground, card(2), 1)).toBe(true)
  })

  it.each([
    ['anything but a one on a free slot', card(2), 0],
    ['a card of another colour', card(2, CardColors.blue), 1],
    ['a card that skips a value', card(3), 1],
    ['a position past the table', card(1), 2],
    ['a negative position', card(1), -1],
    ['a fractional position', card(1), 0.5],
  ])('refuses %s', (_, candidate, position) => {
    expect(checkIsDeckAvailable(playground, candidate, position)).toBe(false)
  })
})

describe('placeCard', () => {
  it('starts a deck on a free slot', () => {
    expect(placeCard(table([null, null]), card(1), 1)).toEqual(table([null, deck(card(1))]))
  })

  it('puts a card on top of a deck', () => {
    expect(placeCard(table([deck(card(1))]), card(2), 0)).toEqual(table([deck(card(1), card(2))]))
  })

  it('moves a deck completed by a ten off the table', () => {
    const nine = Array.from({ length: 9 }, (_, index) => card(index + 1))
    const dropped = deck(card(1, CardColors.blue))

    expect(placeCard(table([deck(...nine)], [dropped]), card(10), 0)).toEqual(table([null], [dropped, deck(...nine, card(10))]))
  })
})

describe('canMutateGameplay', () => {
  it('lets an online player move during a round', () => {
    expect(canMutateGameplay(game(), 'host')).toBe(true)
  })

  it('does not let a disconnected player move', () => {
    expect(canMutateGameplay(game({ status: PlayerStatus.Disconnected }), 'host')).toBe(false)
  })

  it('does not let a spectator move', () => {
    expect(canMutateGameplay(game(), 'spectator')).toBe(false)
  })

  it.each([GameStatus.New, GameStatus.Starting, GameStatus.Pause, GameStatus.RoundFinished])('does not let anyone move in %s', status => {
    expect(canMutateGameplay({ ...game(), status }, 'host')).toBe(false)
  })
})

describe('putCard', () => {
  it('moves a card from the row to the table and leaves its slot empty', () => {
    const next = putCard(game({ cards: [card(5), card(1)] }), 'host', 1, 2)

    expect(next.players.host!.cards).toEqual([card(5), null])
    expect(next.playground.decks).toEqual([null, null, deck(card(1))])
  })

  it.each([
    ['a placement the table refuses', 0, 0],
    ['an empty slot', 1, 0],
    ['a slot past the row', 2, 0],
    ['a fractional slot', 0.5, 0],
  ])('changes nothing for %s', (_, cardIndex, deckIndex) => {
    const before = game({ cards: [card(5), null] })

    expect(putCard(before, 'host', cardIndex, deckIndex)).toBe(before)
  })

  it('changes nothing for someone who is not a player', () => {
    const before = game({ cards: [card(1)] })

    expect(putCard(before, 'spectator', 0, 0)).toBe(before)
  })
})

describe('putCardFromStackOpenDeck', () => {
  it('moves the top of the open stack to the table', () => {
    const next = putCardFromStackOpenDeck(game({ stackOpenDeck: deck(card(4), card(1)) }), 'host', 0)

    expect(next.players.host!.stackOpenDeck).toEqual(deck(card(4)))
    expect(next.playground.decks[0]).toEqual(deck(card(1)))
  })

  it('changes nothing when the top of the open stack does not fit', () => {
    const before = game({ stackOpenDeck: deck(card(1), card(4)) })

    expect(putCardFromStackOpenDeck(before, 'host', 0)).toBe(before)
  })

  it('changes nothing when the open stack is empty', () => {
    const before = game()

    expect(putCardFromStackOpenDeck(before, 'host', 0)).toBe(before)
  })
})

describe('takeFromLigrettoDeck', () => {
  it('fills the first empty slot with the top of the ligretto deck', () => {
    const { game: next, remaining } = takeFromLigrettoDeck(
      game({ cards: [card(5), null, null], ligrettoDeck: { isHidden: true, cards: [card(7), card(8)] } }),
      'host',
    )

    expect(next.players.host!.cards).toEqual([card(5), card(8), null])
    expect(next.players.host!.ligrettoDeck).toEqual({ isHidden: true, cards: [card(7)] })
    expect(remaining).toBe(1)
  })

  it('reports zero when it takes the last card', () => {
    expect(takeFromLigrettoDeck(game({ cards: [null], ligrettoDeck: { isHidden: true, cards: [card(7)] } }), 'host').remaining).toBe(0)
  })

  it('changes nothing with a full row, and reports the deck as it is', () => {
    const before = game({ cards: [card(5)], ligrettoDeck: { isHidden: true, cards: [card(7), card(8)] } })

    expect(takeFromLigrettoDeck(before, 'host')).toEqual({ game: before, remaining: 2 })
  })

  it('changes nothing and reports nothing when the ligretto deck is empty', () => {
    const before = game({ cards: [null] })

    expect(takeFromLigrettoDeck(before, 'host')).toEqual({ game: before })
  })

  it('changes nothing for someone who is not a player', () => {
    const before = game()

    expect(takeFromLigrettoDeck(before, 'spectator')).toEqual({ game: before })
  })
})

describe('takeFromStackDeck', () => {
  it('opens the top three cards of the stack onto the open stack', () => {
    const next = takeFromStackDeck(
      game({ stackDeck: { isHidden: true, cards: [card(1), card(2), card(3), card(4)] }, stackOpenDeck: deck(card(9)) }),
      'host',
    )

    expect(next.players.host!.stackDeck).toEqual({ isHidden: true, cards: [card(1)] })
    expect(next.players.host!.stackOpenDeck).toEqual(deck(card(9), card(2), card(3), card(4)))
  })

  it('opens what is left when the stack holds fewer than three, and shows the stack as empty', () => {
    const next = takeFromStackDeck(game({ stackDeck: { isHidden: true, cards: [card(1), card(2)] } }), 'host')

    expect(next.players.host!.stackDeck).toEqual({ isHidden: false, cards: [] })
    expect(next.players.host!.stackOpenDeck).toEqual(deck(card(1), card(2)))
  })

  it('turns the open stack over when the stack is empty', () => {
    const open = [card(1), card(2), card(3), card(4), card(5)]
    const { stackDeck, stackOpenDeck } = takeFromStackDeck(game({ stackOpenDeck: deck(...open) }), 'host').players.host!

    expect(stackDeck.cards).toHaveLength(2)
    expect(stackDeck.isHidden).toBe(true)
    expect(stackOpenDeck.cards).toHaveLength(3)
    expect([...stackDeck.cards, ...stackOpenDeck.cards].map(key).sort()).toEqual(open.map(key).sort())
  })

  it('changes nothing for someone who is not a player', () => {
    const before = game()

    expect(takeFromStackDeck(before, 'spectator')).toBe(before)
  })
})
