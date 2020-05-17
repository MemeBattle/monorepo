import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Controller } from './controller'
import { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { PlayerService } from '../entities/player/player.service'
import {
  searchRoomsFinishAction,
  RoomsTypes,
  CreateRoomEmitAction,
  SearchRoomsEmitAction,
  ConnectToRoomEmitAction,
  updateRooms,
  connectToRoomSuccessAction,
  connectToRoomErrorAction,
  createRoomSuccessAction,
  updateGameAction,
  GameTypes,
  Game,
  SetPlayerStatusEmitAction,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class GamesController extends Controller {
  @inject(TYPES.GameService) private gameService: GameService
  @inject(TYPES.PlayerService) private playerService: PlayerService
  @inject(TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  handlers = {
    [RoomsTypes.CREATE_ROOM_EMIT]: (socket, action) => this.createGame(socket, action),
    [RoomsTypes.SEARCH_ROOMS_EMIT]: (socket, action) => this.searchRooms(socket, action),
    [RoomsTypes.CONNECT_TO_ROOM_EMIT]: (socket, action) => this.joinGame(socket, action),
    [GameTypes.SET_PLAYER_STATUS_EMIT]: (socket, action) => this.setPlayerStatus(socket, action),
  }

  private async createGame(socket: Socket, action: CreateRoomEmitAction) {
    const newGame = await this.gameService.createGame(action.payload.name)
    const { game, player } = await this.gameService.addPlayer(newGame.id, { isHost: true, user: socket.id })
    socket.emit('event', createRoomSuccessAction({ game, playerColor: player.color }))
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(game)] }))
    socket.join(game.id)
  }

  private async searchRooms(socket: Socket, action: SearchRoomsEmitAction) {
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
  private async joinGame(socket: Socket, action: ConnectToRoomEmitAction) {
    const roomUuid = action.payload.roomUuid

    const game: Game = await this.gameService.getGame(roomUuid)
    if (!game || Object.keys(game.players).length > 3) {
      socket.emit('event', connectToRoomErrorAction())
      return
    }
    socket.join(roomUuid)
    const { game: updatedGame, player } = await this.gameService.addPlayer(roomUuid, { user: socket.id })
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(updatedGame)] }))
    socket.to(roomUuid).emit('event', updateGameAction(updatedGame))
    socket.emit('event', connectToRoomSuccessAction({ game: updatedGame, playerColor: player.color }))
    socket.emit('event', updateGameAction(updatedGame))
    socket.leave(SOCKET_ROOM_LOBBY)
  }

  private async setPlayerStatus(socket: Socket, { payload }: SetPlayerStatusEmitAction) {
    const { gameId, status } = payload

    const game = await this.gameService.updateGamePlayer(gameId, socket.id, { status })
    socket.to(gameId).emit('event', updateGameAction(game))
    socket.emit('event', updateGameAction(game))
  }
}
