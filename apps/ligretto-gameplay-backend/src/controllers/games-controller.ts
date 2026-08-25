import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Controller } from './controller'
import type { Socket } from 'socket.io'
import type { GameService } from '../entities/game/game.service'
import type { UserService } from '../entities/user'
import type { Game } from '@memebattle/ligretto-shared'
import {
  connectToRoomEmitAction,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  createRoomEmitAction,
  createRoomErrorAction,
  CreateRoomErrorCode,
  createRoomSuccessAction,
  GameStatus,
  PlayerStatus,
  leaveFromRoomEmitAction,
  removeRoomAction,
  getRoomsEmitAction,
  setPlayerStatusEmitAction,
  updateGameAction,
  updateRoomsAction,
  userJoinToRoomAction,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'
import type { GameConnectionService } from '../services/game-connection/game-connection.service'
import type { GameOperationSerializer } from '../services/game-operation-serializer'

@injectable()
export class GamesController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService
  @inject(IOC_TYPES.GameConnectionService) private gameConnectionService: GameConnectionService
  @inject(IOC_TYPES.GameOperationSerializer) private gameOperations: GameOperationSerializer

  protected handlers: Controller['handlers'] = {
    [createRoomEmitAction.type]: (socket, action) => this.createGame(socket, action),
    [getRoomsEmitAction.type]: socket => this.getRooms(socket),
    [connectToRoomEmitAction.type]: (socket, action) => this.joinGame(socket, action),
    [setPlayerStatusEmitAction.type]: (socket, action) => this.setPlayerStatus(socket, action),
    [leaveFromRoomEmitAction.type]: socket => this.leaveFromRoomHandler(socket),
  }

  private async createGame(socket: Socket, action: ReturnType<typeof createRoomEmitAction>) {
    const newGame = await this.gameService.createGame(action.payload.name, action.payload.config)

    if (!newGame) {
      return socket.emit('event', createRoomErrorAction({ errorCode: CreateRoomErrorCode.AlreadyExist, name: action.payload.name }))
    }

    socket.emit('event', createRoomSuccessAction({ game: newGame }))
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(newGame)] }))
  }

  private async getRooms(socket: Socket) {
    socket.join(SOCKET_ROOM_LOBBY)
    const games = await this.gameService.getGames()
    socket.emit('event', updateRoomsAction({ rooms: games.map(gameToRoom) }))
  }

  /**
   * Connect to room handler.
   * Add socket to room. Leave from lobby
   * Notify players in room about new player
   * Notify new player about players in room
   *
   * read more: https://miro.com/app/board/o9J_l6Vx4-Q=/?moveToWidget=3458764530187757883&cot=14
   */
  private async joinGame(socket: Socket, action: ReturnType<typeof connectToRoomEmitAction>) {
    const roomUuid = action.payload.roomUuid
    const initialGame: Game | undefined = await this.gameService.getGame(roomUuid)

    if (!initialGame) {
      await this.clearStaleAssociation(socket.data.userId, roomUuid)
      socket.emit('event', connectToRoomErrorAction())
      return
    }

    const userId = socket.data.userId
    const isUserAlreadyPlayer = !!initialGame.players[userId]
    const isUserAlreadySpectator = !!initialGame.spectators[userId]
    const isUserAlreadyInGame = isUserAlreadyPlayer || isUserAlreadySpectator

    if (isUserAlreadyInGame) {
      await this.gameConnectionService.reconnected(roomUuid, userId, this.lifecycleEvents(socket))
      const synchronizedGame = await this.gameOperations.run(roomUuid, async () => {
        const [game, user] = await Promise.all([this.gameService.getGame(roomUuid), this.userService.getUser(userId)])
        if (!game || (!game.players[userId] && !game.spectators[userId]) || user?.currentGameId !== roomUuid || !user.socketIds.includes(socket.id)) {
          return undefined
        }
        return game
      })
      if (!synchronizedGame) {
        if (!(await this.gameService.getGame(roomUuid))) {
          await this.clearStaleAssociation(userId, roomUuid)
        }
        socket.emit('event', connectToRoomErrorAction())
        return
      }
      socket.join(roomUuid)
      socket.leave(SOCKET_ROOM_LOBBY)
      socket.emit('event', connectToRoomSuccessAction({ game: synchronizedGame }))
      socket.emit('event', updateGameAction(synchronizedGame))
      socket.to(roomUuid).emit('event', updateGameAction(synchronizedGame))
      return
    }

    const updatedGame = await this.gameOperations.run(roomUuid, async () => {
      const [game, user] = await Promise.all([this.gameService.getGame(roomUuid), this.userService.getUser(userId)])
      if (!game || !user) {
        if (user?.currentGameId === roomUuid) {
          await this.userService.leaveGame(userId)
        }
        return undefined
      }
      if (game.players[userId] || game.spectators[userId]) {
        return game
      }

      await this.userService.joinGame({ userId, gameId: roomUuid })
      const isGameFull = Object.keys(game.players).length >= game.config.playersMaxCount
      const result =
        isGameFull || game.status === GameStatus.InGame
          ? await this.gameService.addSpectator(roomUuid, { id: userId })
          : await this.gameService.addPlayer(roomUuid, { id: userId })
      if (!result.game) {
        await this.userService.leaveGame(userId)
        return undefined
      }
      return result.game
    })

    if (!updatedGame) {
      socket.emit('event', connectToRoomErrorAction())
      return
    }

    socket.join(roomUuid)
    socket.leave(SOCKET_ROOM_LOBBY)

    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(updatedGame)] }))
    socket.to(roomUuid).emit('event', updateGameAction(updatedGame))
    socket.to(roomUuid).emit('event', userJoinToRoomAction({ userId }))
    socket.emit('event', connectToRoomSuccessAction({ game: updatedGame }))
    socket.emit('event', updateGameAction(updatedGame))
  }

  private async clearStaleAssociation(userId: string, gameId: string) {
    const user = await this.userService.getUser(userId)
    if (user?.currentGameId === gameId) {
      await this.userService.leaveGame(userId)
    }
  }

  private async setPlayerStatus(socket: Socket, { payload }: ReturnType<typeof setPlayerStatusEmitAction>) {
    const { gameId, status } = payload

    if (status !== PlayerStatus.ReadyToPlay && status !== PlayerStatus.DontReadyToPlay) {
      return
    }

    const game = await this.gameService.setPlayerStatusIfEligible(gameId, socket.data.userId, socket.id, status)
    if (!game) {
      return
    }

    socket.to(gameId).emit('event', updateGameAction(game))
    socket.emit('event', updateGameAction(game))
  }

  /**
   * LeaveFromRoomHandler
   *
   * read more: https://miro.com/app/board/o9J_l6Vx4-Q=/?moveToWidget=3458764530187757883&cot=14
   */
  private async leaveFromRoomHandler(socket: Socket) {
    const user = await this.userService.getUser(socket.data.userId)

    if (!user || !user.currentGameId) {
      return
    }

    this.gameConnectionService.explicitLeave(user.currentGameId, user.id)

    if (user.socketIds.length > 1) {
      socket.leave(user.currentGameId)
      return
    }

    const game = await this.gameOperations.run(user.currentGameId, async () => {
      await this.userService.leaveGame(user.id)
      if (!(await this.gameService.getGame(user.currentGameId!))) {
        return undefined
      }
      return this.gameService.leaveGame(user.currentGameId!, user.id)
    })

    if (game) {
      socket.to(game.id).emit('event', updateGameAction(game))
      socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(game)] }))
    } else {
      socket.to(SOCKET_ROOM_LOBBY).emit('event', removeRoomAction({ uuid: user.currentGameId }))
    }
  }

  private lifecycleEvents(socket: Socket) {
    return {
      onUpdate: (game: Game) => {
        socket.to(game.id).emit('event', updateGameAction(game))
        socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(game)] }))
      },
      onDelete: (gameId: string) => socket.to(SOCKET_ROOM_LOBBY).emit('event', removeRoomAction({ uuid: gameId })),
    }
  }

  public async disconnectionHandler(socket: Socket, reason = 'client namespace disconnect') {
    if (reason === 'client namespace disconnect') {
      return this.leaveFromRoomHandler(socket)
    }
    const user = await this.userService.getUser(socket.data.userId)
    if (!user?.currentGameId || (await this.userService.hasLiveSockets(user.id))) {
      return
    }
    this.gameConnectionService.transportDisconnected(user.currentGameId, user.id, this.lifecycleEvents(socket))
  }
}
