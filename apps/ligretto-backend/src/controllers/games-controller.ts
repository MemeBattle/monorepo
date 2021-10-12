import { injectable, inject } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Controller } from './controller'
import type { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { PlayerService } from '../entities/player/player.service'
import { UserService } from '../entities/user'
import type { Game } from '@memebattle/ligretto-shared'
import {
  searchRoomsFinishAction,
  updateRooms,
  connectToRoomSuccessAction,
  connectToRoomErrorAction,
  createRoomSuccessAction,
  createRoomErrorAction,
  updateGameAction,
  createRoomEmitAction,
  searchRoomsEmitAction,
  connectToRoomEmitAction,
  setPlayerStatusEmitAction,
  RoomErrors,
  userJoinToRoomAction,
  leaveFromRoomEmitAction,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class GamesController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.PlayerService) private playerService: PlayerService
  @inject(IOC_TYPES.GameplayOutput) private gameplayOutput: GameplayOutput
  @inject(IOC_TYPES.UserService) private userService: UserService

  handlers = {
    [createRoomEmitAction.type]: (socket, action) => this.createGame(socket, action),
    [searchRoomsEmitAction.type]: (socket, action) => this.searchRooms(socket, action),
    [connectToRoomEmitAction.type]: (socket, action) => this.joinGame(socket, action),
    [setPlayerStatusEmitAction.type]: (socket, action) => this.setPlayerStatus(socket, action),
    [leaveFromRoomEmitAction.type]: socket => this.leaveFromRoomHandler(socket),
  }

  private async createGame(socket: Socket, action: ReturnType<typeof createRoomEmitAction>) {
    const newGame = await this.gameService.createGame(action.payload.name)

    if (!newGame) {
      return socket.emit('event', createRoomErrorAction({ error: RoomErrors.AlreadyExist, name: action.payload.name }))
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
   * @param socket
   * @param action
   */
  private async joinGame(socket: Socket, action: ReturnType<typeof connectToRoomEmitAction>) {
    const roomUuid = action.payload.roomUuid

    const game: Game = await this.gameService.getGame(roomUuid)
    if (!game || Object.keys(game.players).length > 3) {
      socket.emit('event', connectToRoomErrorAction())
      return
    }

    socket.join(roomUuid)
    const playerId = socket.data.user.id
    await this.userService.enterGame(playerId, roomUuid)

    const { game: updatedGame } = await this.gameService.addPlayer(roomUuid, { id: playerId })

    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(updatedGame)] }))
    socket.to(roomUuid).emit('event', updateGameAction(updatedGame))
    socket.emit('event', connectToRoomSuccessAction({ game: updatedGame }))
    socket.emit('event', updateGameAction(updatedGame))
    socket.to(roomUuid).emit('event', userJoinToRoomAction({ userId: playerId }))
    socket.leave(SOCKET_ROOM_LOBBY)
  }

  private async setPlayerStatus(socket: Socket, { payload }: ReturnType<typeof setPlayerStatusEmitAction>) {
    const { gameId, status } = payload

    const game = await this.gameService.updateGamePlayer(gameId, socket.data.user.id, { status })
    socket.to(gameId).emit('event', updateGameAction(game))
    socket.emit('event', updateGameAction(game))
  }

  private async leaveFromRoomHandler(socket: Socket) {
    const user = await this.userService.getUser(socket.data.user.id)
    if (!user) {
      return
    }
    const game = await this.gameService.leaveGame(user.currentGameId, user.id)
    socket.leave(user.currentGameId)
    if (game) {
      socket.to(game.id).emit('event', updateGameAction(game))
    }
  }

  public async disconnectionHandler(socket: Socket) {
    await this.leaveFromRoomHandler(socket)
  }
}
