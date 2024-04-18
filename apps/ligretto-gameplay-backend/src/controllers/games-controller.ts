import * as Sentry from '@sentry/node'
import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Controller } from './controller'
import type { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { UserService } from '../entities/user'
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
  leaveFromRoomEmitAction,
  removeRoomAction,
  getRoomsEmitAction,
  setPlayerStatusEmitAction,
  updateGameAction,
  updateRooms,
  userJoinToRoomAction,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'

@injectable()
export class GamesController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService

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
      return this.emit(socket, createRoomErrorAction({ errorCode: CreateRoomErrorCode.AlreadyExist, name: action.payload.name }))
    }

    this.emit(socket, createRoomSuccessAction({ game: newGame }))
    this.emit(socket.to(SOCKET_ROOM_LOBBY), updateRooms({ rooms: [gameToRoom(newGame)] }))
  }

  private async getRooms(socket: Socket) {
    await Sentry.startSpan({ name: 'getRooms', op: 'perf.getRooms', scope: Sentry.getCurrentScope() }, async span => {
      socket.join(SOCKET_ROOM_LOBBY)
      const games = await this.gameService.getGames()
      this.emit(socket, updateRooms({ rooms: games.map(gameToRoom) }))
    })
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

    const game: Game | undefined = await this.gameService.getGame(roomUuid)

    if (!game) {
      this.emit(socket, connectToRoomErrorAction())
      return
    }

    socket.join(roomUuid)
    socket.leave(SOCKET_ROOM_LOBBY)

    const userId = socket.data.user.id

    const isUserAlreadyPlayer = !!game.players[userId]
    const isUserAlreadySpectator = !!game.spectators[userId]
    const isUserAlreadyInGame = isUserAlreadyPlayer || isUserAlreadySpectator

    if (isUserAlreadyInGame) {
      this.emit(socket, connectToRoomSuccessAction({ game }))
      this.emit(socket, updateGameAction(game))
      return
    }

    await this.userService.joinGame({ userId, gameId: game.id })

    const isGameFull = Object.keys(game.players).length >= game.config.playersMaxCount

    const { game: updatedGame } =
      isGameFull || game.status === GameStatus.InGame
        ? await this.gameService.addSpectator(roomUuid, { id: userId })
        : await this.gameService.addPlayer(roomUuid, { id: userId })

    this.emit(socket.to(SOCKET_ROOM_LOBBY), updateRooms({ rooms: [gameToRoom(updatedGame)] }))
    this.emit(socket.to(roomUuid), updateGameAction(updatedGame))
    this.emit(socket.to(roomUuid), userJoinToRoomAction({ userId }))
    this.emit(socket, connectToRoomSuccessAction({ game: updatedGame }))
    this.emit(socket, updateGameAction(updatedGame))
  }

  private async setPlayerStatus(socket: Socket, { payload }: ReturnType<typeof setPlayerStatusEmitAction>) {
    const { gameId, status } = payload

    const game = await this.gameService.updateGamePlayer(gameId, socket.data.user.id, { status })

    this.emit(socket.to(gameId), updateGameAction(game))
    this.emit(socket, updateGameAction(game))
  }

  /**
   * LeaveFromRoomHandler
   *
   * read more: https://miro.com/app/board/o9J_l6Vx4-Q=/?moveToWidget=3458764530187757883&cot=14
   */
  private async leaveFromRoomHandler(socket: Socket) {
    const user = await this.userService.getUser(socket.data.user.id)

    if (!user || !user.currentGameId) {
      return
    }

    if (user.socketIds.length > 1) {
      socket.leave(user.currentGameId)
      return
    }

    if (!(await this.gameService.getGame(user.currentGameId))) {
      return
    }
    const game = await this.gameService.leaveGame(user.currentGameId, user.id)

    if (game) {
      socket.to(game.id).emit('event', updateGameAction(game))
      this.emit(socket.to(SOCKET_ROOM_LOBBY), updateRooms({ rooms: [gameToRoom(game)] }))
    } else {
      this.emit(socket.to(SOCKET_ROOM_LOBBY), removeRoomAction({ uuid: user.currentGameId }))
    }
  }

  public disconnectionHandler(socket: Socket) {
    return this.leaveFromRoomHandler(socket)
  }
}
