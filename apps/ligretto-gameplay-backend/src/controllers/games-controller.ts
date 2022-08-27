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
  searchRoomsEmitAction,
  searchRoomsFinishAction,
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
    [searchRoomsEmitAction.type]: (socket, action) => this.searchRooms(socket, action),
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
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(newGame)] }))
  }

  private async searchRooms(socket: Socket, action: ReturnType<typeof searchRoomsEmitAction>) {
    socket.join(SOCKET_ROOM_LOBBY)

    const games = await this.gameService.findGames(action.payload.search)
    const message = searchRoomsFinishAction({
      search: action.payload.search,
      rooms: games.map(gameToRoom),
    })
    socket.emit('event', message)
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
      socket.emit('event', connectToRoomErrorAction())
      return
    }

    socket.join(roomUuid)
    socket.leave(SOCKET_ROOM_LOBBY)

    const userId = socket.data.user.id

    const isUserAlreadyPlayer = !!game.players[userId]
    const isUserAlreadySpectator = !!game.spectators[userId]
    const isUserAlreadyInGame = isUserAlreadyPlayer || isUserAlreadySpectator

    if (isUserAlreadyInGame) {
      socket.emit('event', connectToRoomSuccessAction({ game }))
      socket.emit('event', updateGameAction(game))
      return
    }

    await this.userService.joinGame({ userId, gameId: game.id })

    const isGameFull = Object.keys(game.players).length >= game.config.playersMaxCount

    const { game: updatedGame } =
      isGameFull || game.status === GameStatus.InGame
        ? await this.gameService.addSpectator(roomUuid, { id: userId })
        : await this.gameService.addPlayer(roomUuid, { id: userId })

    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(updatedGame)] }))
    socket.to(roomUuid).emit('event', updateGameAction(updatedGame))
    socket.to(roomUuid).emit('event', userJoinToRoomAction({ userId }))
    socket.emit('event', connectToRoomSuccessAction({ game: updatedGame }))
    socket.emit('event', updateGameAction(updatedGame))
  }

  private async setPlayerStatus(socket: Socket, { payload }: ReturnType<typeof setPlayerStatusEmitAction>) {
    const { gameId, status } = payload

    const game = await this.gameService.updateGamePlayer(gameId, socket.data.user.id, { status })

    socket.to(gameId).emit('event', updateGameAction(game))
    socket.emit('event', updateGameAction(game))
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
      socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(game)] }))
    } else {
      socket.to(SOCKET_ROOM_LOBBY).emit('event', removeRoomAction({ uuid: user.currentGameId }))
    }
  }

  public disconnectionHandler(socket: Socket) {
    return this.leaveFromRoomHandler(socket)
  }
}
