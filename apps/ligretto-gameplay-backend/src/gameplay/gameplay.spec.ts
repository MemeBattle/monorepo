import { beforeEach, describe, expect, it } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, type Card, type Game } from '@memebattle/ligretto-shared'
import type { Container } from 'inversify'
import type { Database } from '../database'
import { createIOC } from '../inversify.config'
import { IOC_TYPES } from '../IOC_TYPES'
import type { Gameplay } from './gameplay'

const gameId = 'game'
const playerId = 'player'

const createCard = (value: number, color = CardColors.blue): Card => ({ value, color, playerId })

const createGame = (card: Card, decks: Game['playground']['decks']): Game => ({
  id: gameId,
  name: 'game',
  status: GameStatus.InGame,
  players: {
    [playerId]: {
      id: playerId,
      status: PlayerStatus.InGame,
      cards: [card],
      ligrettoDeck: { cards: [], isHidden: false },
      stackOpenDeck: { cards: [card], isHidden: false },
      stackDeck: { cards: [], isHidden: true },
      isHost: true,
    },
  },
  spectators: {},
  playground: { decks, droppedDecks: [] },
  config: { playersMaxCount: 4, startingDelayInSec: 4, maxCardsOnTable: 12 },
})

describe('Gameplay card placement', () => {
  let container: Container
  let database: Database
  let gameplay: Gameplay

  beforeEach(() => {
    container = createIOC()
    database = container.get(IOC_TYPES.Database)
    gameplay = container.get(IOC_TYPES.Gameplay)
  })

  const seed = async (game: Game) => {
    await database.set(storage => {
      storage.games[game.id] = game
    })
  }

  const getGame = () => database.get(storage => storage.games[gameId])

  describe.each([
    {
      source: 'row',
      put: (gameplay: Gameplay, deckPosition?: number) => gameplay.playerPutCard(gameId, playerId, 0, deckPosition),
      getSourceCards: (game: Game) => game.players[playerId]?.cards,
    },
    {
      source: 'stack-open',
      put: (gameplay: Gameplay, deckPosition?: number) => gameplay.playerPutFromStackOpenDeck(gameId, playerId, deckPosition),
      getSourceCards: (game: Game) => game.players[playerId]?.stackOpenDeck.cards,
    },
  ])('$source card', ({ put, getSourceCards }) => {
    it('keeps a normal card when the destination index is omitted', async () => {
      const card = createCard(2)
      await seed(createGame(card, [{ cards: [createCard(1)], isHidden: false }]))

      await put(gameplay)

      const game = await getGame()
      expect(getSourceCards(game)?.[0]).toEqual(card)
      expect(game.playground.decks[0]?.cards).toEqual([createCard(1)])
    })

    it('automatically places a value-1 card when the destination index is omitted', async () => {
      const card = createCard(1)
      await seed(createGame(card, [null]))

      await put(gameplay)

      const game = await getGame()
      expect(getSourceCards(game)).not.toContainEqual(card)
      expect(game.playground.decks[0]?.cards).toEqual([card])
    })

    it('places a normal card on its valid explicit destination', async () => {
      const card = createCard(2)
      await seed(createGame(card, [null, { cards: [createCard(1)], isHidden: false }]))

      await put(gameplay, 1)

      const game = await getGame()
      expect(getSourceCards(game)).not.toContainEqual(card)
      expect(game.playground.decks[0]).toBeNull()
      expect(game.playground.decks[1]?.cards).toEqual([createCard(1), card])
    })

    it('does not fall back when the explicit destination is invalid', async () => {
      const card = createCard(2)
      await seed(createGame(card, [null, { cards: [createCard(1)], isHidden: false }]))

      await put(gameplay, 0)

      const game = await getGame()
      expect(getSourceCards(game)?.[0]).toEqual(card)
      expect(game.playground.decks).toEqual([null, { cards: [createCard(1)], isHidden: false }])
    })

    it('accepts an explicit valid destination for a value-1 card', async () => {
      const card = createCard(1)
      await seed(createGame(card, [null, null]))

      await put(gameplay, 1)

      const game = await getGame()
      expect(getSourceCards(game)).not.toContainEqual(card)
      expect(game.playground.decks).toEqual([null, { cards: [card], isHidden: false }])
    })

    it('keeps a value-1 card when no empty deck is available', async () => {
      const card = createCard(1)
      await seed(createGame(card, [{ cards: [createCard(1)], isHidden: false }]))

      await put(gameplay)

      const game = await getGame()
      expect(getSourceCards(game)?.[0]).toEqual(card)
      expect(game.playground.decks[0]?.cards).toEqual([createCard(1)])
    })

    it('rejects an out-of-range explicit destination', async () => {
      const card = createCard(1)
      await seed(createGame(card, [null]))

      await put(gameplay, 2)

      const game = await getGame()
      expect(getSourceCards(game)?.[0]).toEqual(card)
      expect(game.playground.decks).toEqual([null])
    })
  })

  it('places a row card only once when duplicate commands run concurrently', async () => {
    const card = createCard(2)
    await seed(
      createGame(card, [
        { cards: [createCard(1)], isHidden: false },
        { cards: [createCard(1)], isHidden: false },
      ]),
    )

    await Promise.all([gameplay.playerPutCard(gameId, playerId, 0, 0), gameplay.playerPutCard(gameId, playerId, 0, 1)])

    const game = await getGame()
    const placedCards = game.playground.decks.flatMap(deck => deck?.cards ?? []).filter(placed => placed.value === 2)
    expect(placedCards).toHaveLength(1)
  })

  it('keeps the second source card when concurrent commands target the same deck', async () => {
    const firstCard = createCard(2)
    const secondCard = createCard(2)
    const game = createGame(firstCard, [{ cards: [createCard(1)], isHidden: false }])
    game.players[playerId]!.cards = [firstCard, secondCard]
    await seed(game)

    await Promise.all([gameplay.playerPutCard(gameId, playerId, 0, 0), gameplay.playerPutCard(gameId, playerId, 1, 0)])

    const updatedGame = await getGame()
    expect(updatedGame.playground.decks[0]?.cards.filter(card => card.value === 2)).toHaveLength(1)
    expect(updatedGame.players[playerId]?.cards.filter(Boolean)).toHaveLength(1)
  })

  it('keeps stack-open placement atomic with drawing from the stack deck', async () => {
    const openCard = createCard(2)
    const drawnCard = createCard(3)
    const game = createGame(openCard, [{ cards: [createCard(1)], isHidden: false }])
    game.players[playerId]!.stackDeck = { cards: [drawnCard], isHidden: false }
    await seed(game)

    await Promise.all([gameplay.playerPutFromStackOpenDeck(gameId, playerId, 0), gameplay.playerTakeFromStackDeck(gameId, playerId)])

    const updatedGame = await getGame()
    expect(updatedGame.playground.decks[0]?.cards).toEqual([createCard(1), openCard])
    expect(updatedGame.players[playerId]?.stackOpenDeck.cards).toEqual([drawnCard])
  })
})
