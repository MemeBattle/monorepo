import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, type Game, type Player } from '@memebattle/ligretto-shared'
import { createClient, type SaveRoundRequest } from '@memebattle/ligretto-core-client/internal'

import { createIOC } from '../../../inversify.config'
import { IOC_TYPES } from '../../../IOC_TYPES'
import type { Database } from '../../../database'
import type { GameService } from '../game.service'
import type { SaveRoundOutcome } from '../../../services/ligretto-core'
import { SAVE_ROUND_RETRY_DELAYS_MS } from '../../../config'
import { deferred } from '../../../../test/utils'

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.InGame,
  cards: [{ color: CardColors.red, value: 4, playerId: id }, null],
  ligrettoDeck: { isHidden: true, cards: [{ color: CardColors.blue, value: 7, playerId: id }] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

const inGame: Game = {
  id: 'game',
  name: 'game',
  status: GameStatus.InGame,
  players: {
    host: player('host', { isHost: true, ligrettoDeck: { isHidden: true, cards: [] } }),
    peer: player('peer'),
  },
  spectators: {},
  playground: {
    decks: [{ isHidden: false, cards: [{ color: CardColors.red, value: 1, playerId: 'host' }] }, null],
    droppedDecks: [{ isHidden: false, cards: [{ color: CardColors.green, value: 2, playerId: 'host' }] }],
  },
  config: { playersMaxCount: 4, startingDelayInSec: 0, maxCardsOnTable: 12 },
}

const clearedTable = { decks: new Array(inGame.config.maxCardsOnTable).fill(null), droppedDecks: [] }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const gameResults = { host: { roundScore: 2, gameScore: 2 }, peer: { roundScore: -2, gameScore: -2 } }

describe('GameService', () => {
  let container: ReturnType<typeof createIOC>
  let database: Database
  let gameService: GameService
  let createGame: ReturnType<typeof vi.fn>
  let saveRound: ReturnType<typeof vi.fn>

  const game = () => database.get(storage => storage.games.game)
  const sentRound = (call = 0): SaveRoundRequest => saveRound.mock.calls[call][1]

  beforeEach(async () => {
    container = createIOC()
    createGame = vi.fn()
    saveRound = vi.fn()
    container.rebind(IOC_TYPES.LigrettoCoreService).toConstantValue({ createGame, saveRound })
    database = container.get(IOC_TYPES.Database)
    gameService = container.get(IOC_TYPES.GameService)
    await database.set(storage => {
      storage.games.game = structuredClone(inGame)
      storage.users.host = { id: 'host', socketIds: ['host-socket'], currentGameId: 'game' }
      storage.users.peer = { id: 'peer', socketIds: ['peer-socket'], currentGameId: 'game' }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('finishRound', () => {
    it('saves the frozen round under a fresh round id and stores the results', async () => {
      saveRound.mockResolvedValue({ ok: true, gameResults })
      const expectedResults = Object.entries(gameService.getRoundResult('game')).map(([playerId, { roundScore }]) => ({
        playerId,
        score: roundScore,
      }))

      const finished = await gameService.finishRound('game')

      expect(saveRound).toHaveBeenCalledTimes(1)
      expect(saveRound.mock.calls[0][0]).toBe('game')
      expect(sentRound().roundId).toMatch(uuidPattern)
      expect(sentRound().results).toEqual(expectedResults)
      expect(finished.gameResults).toEqual(gameResults)
      expect(game().status).toBe(GameStatus.RoundFinished)
      expect(game().playground).toEqual(clearedTable)
      expect(database.get(storage => storage.roundResults.game)).toEqual(gameResults)
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)
    })

    it.each([['core_unavailable'], ['game_not_found']] as const)('closes the round without results when the save answers %s', async error => {
      saveRound.mockResolvedValue({ ok: false, error })
      await database.set(storage => {
        storage.games.game.players.ghost = player('ghost', { status: PlayerStatus.Disconnected })
      })

      const finished = await gameService.finishRound('game')

      expect(finished.gameResults).toBeUndefined()
      expect(finished.game?.status).toBe(GameStatus.RoundFinished)
      expect(game().status).toBe(GameStatus.RoundFinished)
      expect(game().players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(game().players.peer?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(game().players.ghost?.status).toBe(PlayerStatus.Disconnected)
      expect(game().playground).toEqual(clearedTable)
      expect(database.get(storage => storage.roundResults.game)).toBeUndefined()
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)

      expect(gameService.initiateStartGame('game')?.status).toBe(GameStatus.Starting)
      gameService.startGame('game')
      await database.set(storage => {
        storage.games.game.players.host!.cards = [null]
        storage.games.game.players.host!.ligrettoDeck.cards = []
      })
      await gameService.finishRound('game')
      expect(saveRound).toHaveBeenCalledTimes(2)
      expect(sentRound(1).roundId).not.toBe(sentRound(0).roundId)
    })

    it('does nothing for a round that is already finished', async () => {
      await database.set(storage => {
        storage.games.game.status = GameStatus.RoundFinished
      })

      expect(await gameService.finishRound('game')).toEqual({})
      expect(saveRound).not.toHaveBeenCalled()
    })
  })

  describe('while a round save is in flight', () => {
    let save = deferred<SaveRoundOutcome>()

    beforeEach(() => {
      save = deferred<SaveRoundOutcome>()
      saveRound.mockReturnValue(save.promise)
    })

    it('owns the game until the outcome is applied', async () => {
      const finishing = gameService.finishRound('game')

      expect(database.get(storage => storage.roundSavesInFlight.game)).toBe(sentRound().roundId)
      expect(gameService.initiateStartGame('game')).toBeUndefined()
      expect(game().status).toBe(GameStatus.RoundFinished)
      expect(await gameService.finishRound('game')).toEqual({})
      expect(saveRound).toHaveBeenCalledTimes(1)

      save.resolve({ ok: true, gameResults })
      expect((await finishing).gameResults).toEqual(gameResults)
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)
      expect(gameService.initiateStartGame('game')?.status).toBe(GameStatus.Starting)
    })

    it('keeps a player who went offline during the save Disconnected', async () => {
      const finishing = gameService.finishRound('game')
      await database.set(storage => {
        storage.users.peer = { id: 'peer', socketIds: [], currentGameId: 'game' }
      })
      gameService.markPlayerDisconnectedIfOffline('game', 'peer')

      save.resolve({ ok: false, error: 'core_unavailable' })
      await finishing

      expect(game().status).toBe(GameStatus.RoundFinished)
      expect(game().players.peer?.status).toBe(PlayerStatus.Disconnected)
      expect(game().players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
    })

    describe.each([
      ['recorded', { ok: true, gameResults } as SaveRoundOutcome],
      ['not recorded', { ok: false, error: 'core_unavailable' } as SaveRoundOutcome],
    ])('an explicit leave, round %s', (_label, outcome) => {
      it('lands in an intermission the room can refill and restart', async () => {
        await database.set(storage => {
          storage.games.game.spectators.watcher = { id: 'watcher' }
          storage.users.watcher = { id: 'watcher', socketIds: ['watcher-socket'], currentGameId: 'game' }
        })
        const finishing = gameService.finishRound('game')
        const frozen = structuredClone(sentRound())

        gameService.leaveGame('game', 'peer')
        expect(game().status).toBe(GameStatus.RoundFinished)
        expect(sentRound()).toEqual(frozen)

        save.resolve(outcome)
        const finished = await finishing

        expect(game().status).toBe(GameStatus.RoundFinished)
        expect(Object.keys(game().players)).toEqual(['host'])
        expect(game().players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
        expect(game().playground).toEqual(clearedTable)
        expect(finished.gameResults).toEqual(outcome.ok ? gameResults : undefined)

        gameService.addPlayer('game', { id: 'newcomer' })
        expect(game().players.newcomer).toBeDefined()
        expect(gameService.initiateStartGame('game')?.status).toBe(GameStatus.Starting)
        gameService.startGame('game')
        expect(game().status).toBe(GameStatus.InGame)
        expect(game().players.host?.ligrettoDeck.cards).toHaveLength(10)
        expect(game().players.newcomer?.ligrettoDeck.cards).toHaveLength(10)
      })
    })

    it('admits a newcomer as in an intermission without changing the frozen round', async () => {
      const finishing = gameService.finishRound('game')
      const frozen = structuredClone(sentRound())

      gameService.addPlayer('game', { id: 'newcomer' })
      expect(game().players.newcomer?.cards).toEqual([])
      expect(sentRound()).toEqual(frozen)
      expect(sentRound().results.map(({ playerId }) => playerId)).not.toContain('newcomer')

      save.resolve({ ok: false, error: 'core_unavailable' })
      await finishing

      expect(game().status).toBe(GameStatus.RoundFinished)
      expect(game().players.newcomer?.status).toBe(PlayerStatus.DontReadyToPlay)
      gameService.initiateStartGame('game')
      gameService.startGame('game')
      expect(game().players.newcomer?.ligrettoDeck.cards).toHaveLength(10)
    })

    it('recreates nothing when the last players leave during the save', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const finishing = gameService.finishRound('game')

      gameService.leaveGame('game', 'peer')
      gameService.leaveGame('game', 'host')
      expect(game()).toBeUndefined()
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)

      save.resolve({ ok: true, gameResults })
      expect(await finishing).toEqual({})

      expect(database.get(storage => 'game' in storage.games)).toBe(false)
      expect(database.get(storage => 'game' in storage.roundResults)).toBe(false)
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('recreates nothing when the all-offline deletion removes the room during the save', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const finishing = gameService.finishRound('game')
      await database.set(storage => {
        storage.users.host = { id: 'host', socketIds: [], currentGameId: 'game' }
        storage.users.peer = { id: 'peer', socketIds: [], currentGameId: 'game' }
        for (const current of Object.values(storage.games.game.players)) {
          current!.status = PlayerStatus.Disconnected
        }
      })

      expect(gameService.deleteIfAllOffline('game')).toBeDefined()
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)

      save.resolve({ ok: true, gameResults })
      expect(await finishing).toEqual({})

      expect(database.get(storage => 'game' in storage.games)).toBe(false)
      expect(database.get(storage => 'game' in storage.roundResults)).toBe(false)
      expect(database.get(storage => 'game' in storage.roundSavesInFlight)).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the round closed to a new start through a retry delay of the real service', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('upstream unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ gameResults }, { status: 200 }))
    const realContainer = createIOC()
    realContainer.rebind(IOC_TYPES.LigrettoCoreClient).toConstantValue(createClient({ baseUrl: 'http://core.test', fetch }))
    const realDatabase: Database = realContainer.get(IOC_TYPES.Database)
    const realService: GameService = realContainer.get(IOC_TYPES.GameService)
    await realDatabase.set(storage => {
      storage.games.game = structuredClone(inGame)
    })

    const finishing = realService.finishRound('game')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    const during = structuredClone(realDatabase.get(storage => storage.games.game))

    await vi.advanceTimersByTimeAsync(SAVE_ROUND_RETRY_DELAYS_MS[0] - 1)
    expect(realService.initiateStartGame('game')).toBeUndefined()
    expect(realDatabase.get(storage => storage.games.game)).toEqual(during)
    expect(during.players.peer?.cards).toEqual(inGame.players.peer?.cards)
    expect(during.playground).toEqual(inGame.playground)

    await vi.advanceTimersByTimeAsync(1)
    expect((await finishing).gameResults).toEqual(gameResults)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(realDatabase.get(storage => storage.games.game.playground)).toEqual(clearedTable)
    expect(realService.initiateStartGame('game')?.status).toBe(GameStatus.Starting)
  })

  describe('createGame', () => {
    it('creates no room when ligretto-core does not create the game', async () => {
      createGame.mockResolvedValue({ ok: false })

      expect(await gameService.createGame('new room')).toEqual({ ok: false, error: 'core_unavailable' })
      expect(gameService.getGames().map(({ name }) => name)).toEqual(['game'])
    })

    it('refuses an existing name without calling ligretto-core', async () => {
      expect(await gameService.createGame('game')).toEqual({ ok: false, error: 'already_exists' })
      expect(createGame).not.toHaveBeenCalled()
    })

    it('creates the room under the id ligretto-core answers', async () => {
      createGame.mockResolvedValue({ ok: true, gameId: 'core-id' })

      const created = await gameService.createGame('new room', { playersMaxCount: 2 })

      expect(created).toEqual({ ok: true, game: expect.objectContaining({ id: 'core-id', name: 'new room', status: GameStatus.New }) })
      expect(database.get(storage => storage.games['core-id']?.config.playersMaxCount)).toBe(2)
    })
  })
})
