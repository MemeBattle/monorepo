import {
  createRoomEmitAction,
  createRoomErrorAction,
  CreateRoomErrorCode,
  createRoomSuccessAction,
  updateRooms,
  connectToRoomEmitAction,
  connectToRoomErrorAction,
  updateGameAction,
} from '@memebattle/ligretto-shared'

import type { GamesController } from '../games-controller'

import { createIOC } from '../../inversify.config'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import { createSocketMockImpl } from '../../../test/utils'
import type { AnyAction } from '../../types/any-action'
import { SOCKET_ROOM_LOBBY } from '../../config'
import { gameToRoom } from '../../utils/mappers'

describe('Games Controller', () => {
  let container = createIOC()

  let socketMockImpl = createSocketMockImpl()

  const gameId = '1'

  let createGameService = jest.fn().mockReturnValue({ id: gameId })
  let saveGameRoundService = jest.fn().mockReturnValue({})

  let gamesController: GamesController = container.get(IOC_TYPES.GamesController)

  beforeEach(() => {
    container = createIOC()
    socketMockImpl = createSocketMockImpl()
    createGameService = jest.fn().mockReturnValue({ id: gameId })
    saveGameRoundService = jest.fn().mockReturnValue({})
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

      expect(socketMockImpl.emit).toBeCalledTimes(2)
      expect(socketMockImpl.emit).toBeCalledWith('event', createRoomSuccessAction({ game: state.games[gameId] }))
      expect(socketMockImpl.to).toBeCalledWith(SOCKET_ROOM_LOBBY)
      expect(socketMockImpl.emit).toBeCalledWith('event', updateRooms({ rooms: [gameToRoom(state.games[gameId])] }))
    })

    it('Should emit createRoomErrorAction if room already exists', async () => {
      const createGameAction = createRoomEmitAction({ name: 'createGame', config: {} }) as AnyAction
      await gamesController.handleMessage(socketMockImpl, createGameAction)
      const newSocketMock = createSocketMockImpl()
      await gamesController.handleMessage(newSocketMock, createGameAction)

      expect(newSocketMock.emit).toBeCalledTimes(1)
      expect(newSocketMock.emit).toBeCalledWith('event', createRoomErrorAction({ errorCode: CreateRoomErrorCode.AlreadyExist, name: 'createGame' }))
    })
  })

  describe('joinGame', () => {
    const roomUuid = '1'
    const userId = 'userId'

    beforeEach(async () => {
      socketMockImpl.data = { user: { id: userId } }
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

      expect(socketMockImpl.emit).toBeCalledWith('event', connectToRoomErrorAction())
    })

    it('Should join to room and leave from lobby if game exist', async () => {
      await gamesController.handleMessage(socketMockImpl, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      expect(socketMockImpl.join).toBeCalledWith(roomUuid)
      expect(socketMockImpl.leave).toBeCalledWith(SOCKET_ROOM_LOBBY)
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
      secondUserSocket.data = { user: { id: 'secondUserId' } }
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
      secondUserSocket.data = { user: { id: userId } }
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
  })

  describe('leaveFromRoomHandler', () => {
    const roomUuid = '1'
    const userOneId = 'userOneId'
    const userTwoId = 'userTwoId'
    let socketOne = createSocketMockImpl({ id: 'socket1', data: { user: { id: userOneId } } })
    let socketTwo = createSocketMockImpl({ id: 'socket2', data: { user: { id: userTwoId } } })

    beforeEach(async () => {
      gamesController = container.get(IOC_TYPES.GamesController)
      const database: Database = container.get(IOC_TYPES.Database)
      socketOne = createSocketMockImpl({ id: 'socket1', data: { user: { id: userOneId } } })
      socketTwo = createSocketMockImpl({ id: 'socket2', data: { user: { id: userTwoId } } })

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
      expect(socketOne.to).toBeCalledTimes(4)
      expect(socketOne.emit).toBeCalledWith('event', updateRooms({ rooms: [gameToRoom(state.games[roomUuid])] }))
      expect(socketOne.emit).toBeCalledWith('event', updateGameAction(state.games[roomUuid]))
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

      expect(saveGameRoundService).toBeCalledTimes(0)
    })

    it('Should create a relevant state if last user disconnected', async () => {
      const database: Database = container.get(IOC_TYPES.Database)
      await gamesController.handleMessage(socketOne, connectToRoomEmitAction({ roomUuid }) as AnyAction)

      await gamesController.disconnectionHandler(socketOne)

      const state = await database.get(storage => storage)
      expect(state).toMatchSnapshot()
    })
  })
})
