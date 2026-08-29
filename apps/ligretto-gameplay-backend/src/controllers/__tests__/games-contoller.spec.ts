import { describe, it, vi, beforeEach, expect } from 'vitest'

import {
  createRoomEmitAction,
  createRoomErrorAction,
  CreateRoomErrorCode,
  createRoomSuccessAction,
  endRoundAction,
  updateRoomsAction,
  connectToRoomEmitAction,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  updateGameAction,
  PlayerStatus,
  GameStatus,
  setPlayerStatusEmitAction,
} from '@memebattle/ligretto-shared'

import type { GamesController } from '../games-controller'

import { createIOC } from '../../inversify.config'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import { createSocketMockImpl } from '../../../test/utils'
import type { AnyAction } from '../../types/any-action'
import { ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS, DISCONNECT_GRACE_PERIOD_MS, SOCKET_ROOM_LOBBY } from '../../config'
import type { UserService } from '../../entities/user'
import type { GameService } from '../../entities/game/game.service'
import { gameToRoom } from '../../utils/mappers'

describe('Games Controller', () => {
  let container = createIOC()

  let socketMockImpl = createSocketMockImpl()

  const gameId = '1'

  let createGameService = vi.fn().mockReturnValue({ id: gameId })
  let saveGameRoundService = vi.fn().mockReturnValue({})

  let gamesController: GamesController = container.get(IOC_TYPES.GamesController)

  beforeEach(() => {
    container = createIOC()
    socketMockImpl = createSocketMockImpl()
    createGameService = vi.fn().mockReturnValue({ id: gameId })
    saveGameRoundService = vi.fn().mockReturnValue({})
    container.rebind(IOC_TYPES.LigrettoCoreService).toConstantValue({ createGameService, saveGameRoundService })
    gamesController = container.get(IOC_TYPES.GamesController)
  })

  it('should be defined', () => {
    expect(gamesController).toBeDefined()
  })

  describe('createGame', () => {
    it('Should create relevant state on create game', async () => {
      const database: Database = container.get(IOC_TYPES.Database)

      const roomName = 'createGame'

      const createGameAction = createRoomEmitAction({ name: roomName, config: {} }) as AnyAction

      await gamesController.handleMessage(socketMockImpl, createGameAction)

      const state = await database.get(db => db)
      expect(state).toMatchSnapshot()

      expect(socketMockImpl.emit).toHaveBeenCalledTimes(2)
      expect(socketMockImpl.emit).toHaveBeenCalledWith('event', createRoomSuccessAction({ game: state.games[gameId] }))
      expect(socketMockImpl.to).toHaveBeenCalledWith(SOCKET_ROOM_LOBBY)
      expect(socketMockImpl.emit).toHaveBeenCalledWith('event', updateRoomsAction({ rooms: [gameToRoom(state.games[gameId])] }))
    })

    it('Should emit createRoomErrorAction if room already exists', async () => {
      const createGameAction = createRoomEmitAction({ name: 'createGame', config: {} }) as AnyAction
      await gamesController.handleMessage(socketMockImpl, createGameAction)
      const newSocketMock = createSocketMockImpl()
      await gamesController.handleMessage(newSocketMock, createGameAction)

      expect(newSocketMock.emit).toHaveBeenCalledTimes(1)
      expect(newSocketMock.emit).toHaveBeenCalledWith(
        'event',
        createRoomErrorAction({ errorCode: CreateRoomErrorCode.AlreadyExist, name: 'createGame' }),
      )
    })
  })

  describe('joinGame', () => {
    const roomUuid = '1'
    const userId = 'userId'

    beforeEach(async () => {
      socketMockImpl.data = { userId }
      gamesController = container.get(IOC_TYPES.GamesController)
      const database: Database = container.get(IOC_TYPES.Database)

      await database.set(storage => {
        storage.users = {
          [userId]: {
            id: userId,
            socketIds: [socketMockImpl.id],
            currentGameId: roomUuid,
          },
        }
      })

      await gamesController.handleMessage(socketMockImpl, createRoomEmitAction({ name: 'createGame', config: {} }) as AnyAction)
    })

    it('Should dispatch connectToRoomErrorAction if room does not exists', async () => {
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid: 'notExistsRoomUuid' }) as AnyAction)

      expect(socketMockImpl.emit).toHaveBeenCalledWith('event', connectToRoomErrorAction())
    })

    it('Should join to room and leave from lobby if game exist', async () => {
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(socketMockImpl.join).toHaveBeenCalledWith(roomUuid)
      expect(socketMockImpl.leave).toHaveBeenCalledWith(SOCKET_ROOM_LOBBY)
    })

    it('Should create relevant state on join room as first player', async () => {
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      const database: Database = container.get(IOC_TYPES.Database)

      const state = await database.get(db => db)
      expect(state).toMatchSnapshot()
    })

    it('Should create relevant state on join room second player', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      const secondUserSocket = createSocketMockImpl({ id: 'secondUserSocketId' })
      secondUserSocket.data = { userId: 'secondUserId' }
      const secondUserId = 'secondUserId'
      await database.set(storage => {
        storage.users = {
          ...storage.users,
          [secondUserId]: {
            id: userId,
            socketIds: [secondUserSocket.id],
            currentGameId: roomUuid,
          },
        }
      })
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      await gamesController.handleMessage(secondUserSocket, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      const state = await database.get(db => db)
      expect(state).toMatchSnapshot()
    })

    it('Should create relevant state on join room by second connection', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      const secondUserSocket = createSocketMockImpl()
      secondUserSocket.data = { userId }
      await database.set(storage => {
        storage.users = {
          ...storage.users,
          [userId]: {
            id: userId,
            socketIds: [socketMockImpl.id, secondUserSocket.id],
            currentGameId: roomUuid,
          },
        }
      })
      await gamesController.handleMessage(secondUserSocket, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      const state = await database.get(db => db)
      expect(state).toMatchSnapshot()
    })

    it('restores the user-game association on rejoin', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      await database.set(storage => {
        storage.users[userId]!.currentGameId = 'other-game'
      })

      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(await database.get(storage => storage.users[userId]?.currentGameId)).toBe(roomUuid)
    })

    it('joins a paused game as a spectator', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      const spectatorSocket = createSocketMockImpl({ id: 'spectator-socket', data: { userId: 'spectatorUser' } })
      await database.set(storage => {
        storage.games[roomUuid].status = GameStatus.Pause
        storage.users.spectatorUser = { id: 'spectatorUser', socketIds: [spectatorSocket.id] }
      })

      await gamesController.handleMessage(spectatorSocket, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      const game = await database.get(storage => storage.games[roomUuid])
      expect(game.spectators.spectatorUser).toBeDefined()
      expect(game.players.spectatorUser).toBeUndefined()
    })

    it('sends the last round results to a client joining after a finished round', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      const gameService = container.get<GameService>(IOC_TYPES.GameService)
      const gameResults = { [userId]: { roundScore: 3, gameScore: 3 } }
      saveGameRoundService.mockReturnValue({ gameResults })
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      await gameService.finishRound(roomUuid)

      const rejoinSocket = createSocketMockImpl({ id: 'rejoin-socket', data: { userId } })
      await database.set(storage => {
        storage.users[userId] = { id: userId, socketIds: [socketMockImpl.id, rejoinSocket.id], currentGameId: roomUuid }
      })
      await gamesController.handleMessage(rejoinSocket, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(rejoinSocket.emit).toHaveBeenCalledWith('event', endRoundAction(gameResults))
    })

    it('does not join or retain a stale association with a deleted room', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await database.set(storage => delete storage.games[roomUuid])

      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(await database.get(storage => storage.users[userId]?.currentGameId)).not.toBe(roomUuid)
      expect(socketMockImpl.emit).toHaveBeenCalledWith('event', connectToRoomErrorAction())
      expect(socketMockImpl.emit).not.toHaveBeenCalledWith('event', expect.objectContaining({ type: connectToRoomSuccessAction.type }))
    })

    it('does not reconnect to a game deleted since the last connection', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      vi.mocked(socketMockImpl.emit).mockClear()
      await database.set(storage => delete storage.games[roomUuid])

      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(socketMockImpl.emit).toHaveBeenCalledWith('event', connectToRoomErrorAction())
      expect(socketMockImpl.emit).not.toHaveBeenCalledWith('event', expect.objectContaining({ type: connectToRoomSuccessAction.type }))
    })
  })

  describe('leaveFromRoomHandler', () => {
    const roomUuid = '1'
    const userOneId = 'userOneId'
    const userTwoId = 'userTwoId'
    let socketOne = createSocketMockImpl({ id: 'socket1', data: { userId: userOneId } })
    let socketTwo = createSocketMockImpl({ id: 'socket2', data: { userId: userTwoId } })

    beforeEach(async () => {
      gamesController = container.get(IOC_TYPES.GamesController)
      const database: Database = container.get(IOC_TYPES.Database)
      socketOne = createSocketMockImpl({ id: 'socket1', data: { userId: userOneId } })
      socketTwo = createSocketMockImpl({ id: 'socket2', data: { userId: userTwoId } })

      await database.set(storage => {
        storage.users = {
          [userOneId]: {
            id: userOneId,
            socketIds: [socketMockImpl.id],
            currentGameId: roomUuid,
          },
        }
      })

      await gamesController.handleMessage(
        socketOne,
        createRoomEmitAction({
          name: 'createGame',
          config: {},
        }) as AnyAction,
      )
      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)
    })

    it('Should remove current socketId from user socket ids if user connected from few accounts', async () => {
      const database: Database = container.get(IOC_TYPES.Database)

      await database.set(storage => {
        storage.users = {
          [userOneId]: {
            id: userOneId,
            socketIds: [socketOne.id, socketTwo.id],
            currentGameId: roomUuid,
          },
        }
      })

      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await gamesController.disconnectionHandler(socketOne)

      const state = await database.get(storage => storage)
      expect(state).toMatchSnapshot()
      expect(socketOne.to).toHaveBeenCalledTimes(5)
      expect(socketOne.emit).toHaveBeenCalledWith('event', updateRoomsAction({ rooms: [gameToRoom(state.games[roomUuid])] }))
      expect(socketOne.emit).toHaveBeenCalledWith('event', updateGameAction(state.games[roomUuid]))
    })

    it('Should create a relevant game state if one of two players leaved', async () => {
      const database: Database = container.get(IOC_TYPES.Database)

      await database.set(storage => {
        storage.users = {
          ...storage.users,
          [userTwoId]: {
            id: userTwoId,
            socketIds: [userTwoId],
            currentGameId: roomUuid,
          },
        }
      })

      await gamesController.handleMessage(socketTwo, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await gamesController.disconnectionHandler(socketOne)

      const state = await database.get(storage => storage)
      expect(state).toMatchSnapshot()
    })

    it('Should not call save results if last user disconnected', async () => {
      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await gamesController.disconnectionHandler(socketOne)

      expect(saveGameRoundService).toHaveBeenCalledTimes(0)
    })

    it('Should create a relevant state if last user disconnected', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await gamesController.disconnectionHandler(socketOne)

      const state = await database.get(storage => storage)
      expect(state).toMatchSnapshot()
      expect(state.users[userOneId]?.currentGameId).toBeUndefined()
    })

    it('keeps the finished-round intermission when one of two players leaves', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await database.set(storage => {
        storage.users[userTwoId] = { id: userTwoId, socketIds: [socketTwo.id], currentGameId: roomUuid }
      })
      await gamesController.handleMessage(socketTwo, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      await database.set(storage => {
        storage.games[roomUuid].status = GameStatus.RoundFinished
      })

      await gamesController.disconnectionHandler(socketOne)

      const game = await database.get(storage => storage.games[roomUuid])
      expect(game.status).toBe(GameStatus.RoundFinished)
      expect(game.players[userOneId]).toBeUndefined()
      expect(game.players[userTwoId]).toBeDefined()
    })

    it('abandons the round when an explicit leave drops the game below two online players', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await database.set(storage => {
        storage.users[userTwoId] = { id: userTwoId, socketIds: [socketTwo.id], currentGameId: roomUuid }
      })
      await gamesController.handleMessage(socketTwo, connectToRoomEmitAction({ roomUuid }) as AnyAction)
      await database.set(storage => {
        storage.games[roomUuid].status = GameStatus.InGame
      })

      await gamesController.disconnectionHandler(socketOne)

      const game = await database.get(storage => storage.games[roomUuid])
      expect(game.status).toBe(GameStatus.RoundFinished)
      expect(game.playground).toEqual({ decks: new Array(game.config.maxCardsOnTable).fill(null), droppedDecks: [] })
      expect(game.players[userTwoId]?.status).toBe(PlayerStatus.DontReadyToPlay)
    })

    it('prefers an online successor when the leaving host hands the role over', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await database.set(storage => {
        const host = storage.games[roomUuid].players[userOneId]!
        storage.games[roomUuid].players = {
          [userOneId]: host,
          offlinePeer: { ...structuredClone(host), id: 'offlinePeer', isHost: false, status: PlayerStatus.Disconnected },
          [userTwoId]: { ...structuredClone(host), id: userTwoId, isHost: false, status: PlayerStatus.ReadyToPlay },
        }
      })

      await gamesController.disconnectionHandler(socketOne)

      const game = await database.get(storage => storage.games[roomUuid])
      expect(game.players[userTwoId]?.isHost).toBe(true)
      expect(game.players.offlinePeer?.isHost).toBe(false)
    })

    it('schedules deletion when the last online player leaves a room of disconnected players', async () => {
      vi.useFakeTimers()
      const database: Database = container.get(IOC_TYPES.Database)
      await database.set(storage => {
        const host = storage.games[roomUuid].players[userOneId]!
        storage.games[roomUuid].status = GameStatus.InGame
        storage.games[roomUuid].players = {
          [userOneId]: host,
          offlinePeer: { ...structuredClone(host), id: 'offlinePeer', isHost: false, status: PlayerStatus.Disconnected },
        }
        storage.users.offlinePeer = { id: 'offlinePeer', socketIds: [], currentGameId: roomUuid }
      })

      await gamesController.disconnectionHandler(socketOne)
      await vi.advanceTimersByTimeAsync(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

      expect(await database.get(storage => storage.games[roomUuid])).toBeUndefined()
      vi.useRealTimers()
    })

    it('retains a player seat after a recoverable transport disconnect', async () => {
      vi.useFakeTimers()
      const database: Database = container.get(IOC_TYPES.Database)
      const users: UserService = container.get(IOC_TYPES.UserService)
      await database.set(storage => {
        storage.users[userOneId] = { id: userOneId, socketIds: [socketOne.id], currentGameId: roomUuid }
      })
      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await users.disconnectionHandler({ userId: userOneId, socketId: socketOne.id })
      await gamesController.disconnectionHandler(socketOne, 'transport close')
      await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)

      const retained = await database.get(storage => storage.games[roomUuid])
      expect(retained.players[userOneId]?.status).toBe(PlayerStatus.Disconnected)
      expect(retained.players[userOneId]).toBeDefined()
    })
  })

  describe('setPlayerStatus', () => {
    const roomUuid = 'status-game'
    const userId = 'status-player'
    let database: Database
    let socket = createSocketMockImpl({ id: 'status-socket', data: { userId } })

    beforeEach(async () => {
      database = container.get(IOC_TYPES.Database)
      socket = createSocketMockImpl({ id: 'status-socket', data: { userId } })
      await database.set(storage => {
        storage.games[roomUuid] = {
          id: roomUuid,
          name: roomUuid,
          status: GameStatus.New,
          players: {
            [userId]: {
              id: userId,
              isHost: true,
              status: PlayerStatus.DontReadyToPlay,
              cards: [],
              ligrettoDeck: { cards: [], isHidden: true },
              stackDeck: { cards: [], isHidden: true },
              stackOpenDeck: { cards: [], isHidden: false },
            },
          },
          spectators: {},
          playground: { decks: [], droppedDecks: [] },
          config: { playersMaxCount: 4, startingDelayInSec: 0, dndEnabled: false, maxCardsOnTable: 12 },
        }
        storage.users[userId] = { id: userId, socketIds: [socket.id], currentGameId: roomUuid }
      })
    })

    it.each([PlayerStatus.ReadyToPlay, PlayerStatus.DontReadyToPlay])('allows the lobby transition to %s', async status => {
      await gamesController.handleMessage(socket, setPlayerStatusEmitAction({ gameId: roomUuid, status }) as AnyAction)

      expect((await database.get(storage => storage.games[roomUuid])).players[userId]?.status).toBe(status)
      expect(socket.emit).toHaveBeenCalled()
    })

    it('allows readiness toggles after a finished round', async () => {
      await database.set(storage => {
        storage.games[roomUuid].status = GameStatus.RoundFinished
      })

      await gamesController.handleMessage(socket, setPlayerStatusEmitAction({ gameId: roomUuid, status: PlayerStatus.ReadyToPlay }) as AnyAction)

      expect((await database.get(storage => storage.games[roomUuid])).players[userId]?.status).toBe(PlayerStatus.ReadyToPlay)
      expect(socket.emit).toHaveBeenCalled()
    })

    it.each([PlayerStatus.InGame, PlayerStatus.Disconnected])('rejects the client-controlled status %s', async status => {
      await gamesController.handleMessage(socket, setPlayerStatusEmitAction({ gameId: roomUuid, status }) as AnyAction)

      expect((await database.get(storage => storage.games[roomUuid])).players[userId]?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(socket.emit).not.toHaveBeenCalled()
    })

    it.each([
      ['wrong game association', 'other-game', false, PlayerStatus.DontReadyToPlay, GameStatus.New],
      ['spectator', roomUuid, true, undefined, GameStatus.New],
      ['disconnected player', roomUuid, false, PlayerStatus.Disconnected, GameStatus.New],
      ['active game', roomUuid, false, PlayerStatus.InGame, GameStatus.InGame],
    ])('rejects a %s sender', async (_label, currentGameId, spectator, playerStatus, gameStatus) => {
      await database.set(storage => {
        storage.users[userId]!.currentGameId = currentGameId
        storage.games[roomUuid].status = gameStatus
        if (spectator) {
          delete storage.games[roomUuid].players[userId]
          storage.games[roomUuid].spectators[userId] = { id: userId }
        } else {
          storage.games[roomUuid].players[userId]!.status = playerStatus!
        }
      })
      const before = await database.get(storage => structuredClone(storage.games[roomUuid]))

      await gamesController.handleMessage(socket, setPlayerStatusEmitAction({ gameId: roomUuid, status: PlayerStatus.ReadyToPlay }) as AnyAction)

      expect(await database.get(storage => storage.games[roomUuid])).toEqual(before)
      expect(socket.emit).not.toHaveBeenCalled()
    })
  })
})
