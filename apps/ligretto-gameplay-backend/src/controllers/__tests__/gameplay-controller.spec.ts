import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CardColors,
  GameStatus,
  PlayerStatus,
  putCardAction,
  resumeGameEmitAction,
  startGameEmitAction,
  updateGameAction,
  type Game,
} from '@memebattle/ligretto-shared'

import type { GameplayController } from '../gameplay-controller'
import { createIOC } from '../../inversify.config'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import { createSocketMockImpl } from '../../../test/utils'
import type { AnyAction } from '../../types/any-action'
import type { UserService } from '../../entities/user'
import { DISCONNECT_GRACE_PERIOD_MS } from '../../config'
import type { GameConnectionService } from '../../services/game-connection/game-connection.service'

const pausedGame: Game = {
  id: 'paused-game',
  name: 'Paused game',
  status: GameStatus.Pause,
  players: {
    player: {
      id: 'player',
      isHost: true,
      status: PlayerStatus.InGame,
      cards: [{ color: CardColors.red, value: 4, playerId: 'player' }],
      ligrettoDeck: {
        isHidden: true,
        cards: [{ color: CardColors.blue, value: 7, playerId: 'player' }],
      },
      stackOpenDeck: {
        isHidden: false,
        cards: [{ color: CardColors.green, value: 3, playerId: 'player' }],
      },
      stackDeck: {
        isHidden: true,
        cards: [{ color: CardColors.yellow, value: 9, playerId: 'player' }],
      },
    },
    peer: {
      id: 'peer',
      isHost: false,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: { isHidden: false, cards: [] },
      stackDeck: { isHidden: true, cards: [] },
    },
  },
  spectators: { spectator: { id: 'spectator' } },
  playground: {
    decks: [{ isHidden: false, cards: [{ color: CardColors.red, value: 1, playerId: 'player' }] }],
    droppedDecks: [{ isHidden: false, cards: [{ color: CardColors.blue, value: 2, playerId: 'player' }] }],
  },
  config: {
    startingDelayInSec: 4,
    playersMaxCount: 4,
    dndEnabled: false,
    maxCardsOnTable: 12,
  },
}

describe('Gameplay Controller', () => {
  let container: ReturnType<typeof createIOC>
  let gameplayController: GameplayController
  let database: Database
  let socket = createSocketMockImpl()

  beforeEach(async () => {
    container = createIOC()
    gameplayController = container.get(IOC_TYPES.GameplayController)
    database = container.get(IOC_TYPES.Database)
    socket = createSocketMockImpl({ data: { userId: 'player' } })

    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(pausedGame)
      storage.users.player = { id: 'player', socketIds: [socket.id], currentGameId: pausedGame.id }
    })
  })

  it('resumes a paused game without changing its in-progress state', async () => {
    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const resumedGame = await database.get(storage => storage.games[pausedGame.id])
    const expectedGame = { ...pausedGame, status: GameStatus.InGame }

    expect(resumedGame).toEqual(expectedGame)
    expect(socket.to).toHaveBeenCalledWith(pausedGame.id)
    expect(socket.emit).toHaveBeenCalledWith('event', updateGameAction(expectedGame))
  })

  it('does not allow a non-host socket to resume a paused game', async () => {
    const nonHostSocket = createSocketMockImpl({ data: { userId: 'spectator' } })

    await gameplayController.handleMessage(nonHostSocket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game).toEqual(pausedGame)
    expect(nonHostSocket.to).not.toHaveBeenCalled()
    expect(nonHostSocket.emit).not.toHaveBeenCalled()
  })

  it('does not resume until at least two retained players are online', async () => {
    await database.set(storage => {
      const game = storage.games[pausedGame.id]
      storage.games[pausedGame.id] = {
        ...game,
        players: { ...game.players, peer: { ...game.players.peer!, status: PlayerStatus.Disconnected } },
      }
    })

    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    expect((await database.get(storage => storage.games[pausedGame.id])).status).toBe(GameStatus.Pause)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('ignores a resume action for an unknown game', async () => {
    const gamesBefore = await database.get(storage => structuredClone(storage.games))

    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: 'unknown-game' }) as AnyAction)

    const gamesAfter = await database.get(storage => storage.games)
    expect(gamesAfter).toEqual(gamesBefore)
    expect(socket.to).not.toHaveBeenCalled()
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('does not change a game that is not paused', async () => {
    const activeGame = { ...pausedGame, status: GameStatus.New }
    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(activeGame)
    })

    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game).toEqual(activeGame)
  })

  it('rejects gameplay mutations while paused', async () => {
    await gameplayController.handleMessage(socket, putCardAction({ gameId: pausedGame.id, cardIndex: 0, playgroundDeckIndex: 0 }) as AnyAction)

    expect(await database.get(storage => storage.games[pausedGame.id])).toEqual(pausedGame)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it.each([
    ['disconnected player', 'player', PlayerStatus.Disconnected, pausedGame.id],
    ['spectator', 'spectator', undefined, pausedGame.id],
    ['player associated with another game', 'player', PlayerStatus.InGame, 'other-game'],
  ])('rejects gameplay mutations from a %s', async (_label, userId, status, currentGameId) => {
    const sender = createSocketMockImpl({ data: { userId } })
    await database.set(storage => {
      const game = storage.games[pausedGame.id]
      storage.games[pausedGame.id] = {
        ...game,
        status: GameStatus.InGame,
        players: userId === 'player' && status ? { ...game.players, player: { ...game.players.player!, status } } : game.players,
      }
      storage.users[userId] = { id: userId, socketIds: [sender.id], currentGameId }
    })
    const before = await database.get(storage => structuredClone(storage.games[pausedGame.id]))

    await gameplayController.handleMessage(sender, putCardAction({ gameId: pausedGame.id, cardIndex: 0, playgroundDeckIndex: 0 }) as AnyAction)

    expect(await database.get(storage => storage.games[pausedGame.id])).toEqual(before)
    expect(sender.emit).not.toHaveBeenCalled()
  })

  it('keeps the start action on the fresh-round initialization path', async () => {
    const newGame = {
      ...pausedGame,
      status: GameStatus.New,
      config: { ...pausedGame.config, startingDelayInSec: 0 },
    }
    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(newGame)
    })

    await gameplayController.handleMessage(socket, startGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game.status).toBe(GameStatus.InGame)
    expect(game.players.player?.cards).not.toEqual(pausedGame.players.player?.cards)
    expect(game.playground).toEqual({ decks: new Array(pausedGame.config.maxCardsOnTable).fill(null), droppedDecks: [] })
  })

  it.each([
    ['unknown game', 'unknown-game', 'player', pausedGame.id, socket.id],
    ['wrong game association', pausedGame.id, 'player', 'other-game', socket.id],
    ['non-host', pausedGame.id, 'peer', pausedGame.id, 'peer-socket'],
    ['stale socket', pausedGame.id, 'player', pausedGame.id, 'replacement-socket'],
  ])('rejects start from an %s sender', async (_label, gameId, userId, currentGameId, liveSocketId) => {
    const sender = createSocketMockImpl({ id: userId === 'player' ? socket.id : 'peer-socket', data: { userId } })
    await database.set(storage => {
      storage.games[pausedGame.id] = { ...structuredClone(pausedGame), status: GameStatus.New }
      storage.users[userId] = { id: userId, socketIds: [liveSocketId], currentGameId }
    })
    const before = await database.get(storage => structuredClone(storage.games[pausedGame.id]))

    await gameplayController.handleMessage(sender, startGameEmitAction({ gameId }) as AnyAction)

    expect(await database.get(storage => storage.games[pausedGame.id])).toEqual(before)
    expect(sender.emit).not.toHaveBeenCalled()
  })

  it('starts the next round from a finished round', async () => {
    await database.set(storage => {
      const game = storage.games[pausedGame.id]
      storage.games[pausedGame.id] = {
        ...game,
        status: GameStatus.RoundFinished,
        config: { ...game.config, startingDelayInSec: 0 },
        players: {
          player: { ...game.players.player!, status: PlayerStatus.DontReadyToPlay },
          peer: { ...game.players.peer!, status: PlayerStatus.DontReadyToPlay },
        },
      }
    })

    await gameplayController.handleMessage(socket, startGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game.status).toBe(GameStatus.InGame)
    expect(game.players.player?.status).toBe(PlayerStatus.InGame)
    expect(game.players.player?.ligrettoDeck.cards).toHaveLength(10)
    expect(game.playground).toEqual({ decks: new Array(pausedGame.config.maxCardsOnTable).fill(null), droppedDecks: [] })
  })

  it.each([
    ['a paused game', GameStatus.Pause, PlayerStatus.InGame],
    ['fewer than two online players', GameStatus.New, PlayerStatus.Disconnected],
  ])('rejects start with %s', async (_label, status, peerStatus) => {
    await database.set(storage => {
      storage.games[pausedGame.id] = {
        ...structuredClone(pausedGame),
        status,
        players: { ...pausedGame.players, peer: { ...pausedGame.players.peer!, status: peerStatus } },
      }
    })
    const before = await database.get(storage => structuredClone(storage.games[pausedGame.id]))

    await gameplayController.handleMessage(socket, startGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    expect(await database.get(storage => storage.games[pausedGame.id])).toEqual(before)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('applies a disconnect during the starting countdown and pauses when needed', async () => {
    vi.useFakeTimers()
    const connectionService = container.get<GameConnectionService>(IOC_TYPES.GameConnectionService)
    const users = container.get<UserService>(IOC_TYPES.UserService)
    await database.set(storage => {
      storage.games[pausedGame.id] = {
        ...structuredClone(pausedGame),
        status: GameStatus.New,
        config: { ...pausedGame.config, startingDelayInSec: 1 },
      }
      storage.users.peer = { id: 'peer', socketIds: ['peer-socket'], currentGameId: pausedGame.id }
    })

    const starting = gameplayController.handleMessage(socket, startGameEmitAction({ gameId: pausedGame.id }) as AnyAction)
    await vi.advanceTimersByTimeAsync(1)
    users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    connectionService.transportDisconnected(pausedGame.id, 'peer', { onUpdate: vi.fn(), onDelete: vi.fn() })
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    await vi.advanceTimersByTimeAsync(1_000)
    await starting

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game.players.peer?.status).toBe(PlayerStatus.Disconnected)
    expect(game.status).toBe(GameStatus.Pause)

    vi.useRealTimers()
  })
})
