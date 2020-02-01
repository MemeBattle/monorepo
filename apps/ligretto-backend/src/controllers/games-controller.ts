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
  CardColors,
  Player,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'

const emptyPlayer: Player = {
  user: 'empty',
  stackDeck: {
    isHidden: true,
    cards: [],
  },
  color: CardColors.empty,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: {
    isHidden: true,
    cards: [],
  },
}

@injectable()
export class GamesController extends Controller {
  @inject(TYPES.GameService) private gameService: GameService
  @inject(TYPES.PlayerService) private playerService: PlayerService

  handlers = {
    [RoomsTypes.CREATE_ROOM_EMIT]: (socket, action) => this.createGame(socket, action),
    [RoomsTypes.SEARCH_ROOMS_EMIT]: (socket, action) => this.searchRooms(socket, action),
    [RoomsTypes.CONNECT_TO_ROOM_EMIT]: (socket, action) => this.joinGame(socket, action),
  }

  private async createGame(socket: Socket, action: CreateRoomEmitAction) {
    const game = await this.gameService.createGame(action.payload.name)
    socket.emit('Game created', game) // Надо заэмитить успешное создание комнаты
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRooms({ rooms: [gameToRoom(game)] }))
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
    socket.join(roomUuid)
    socket.leave(SOCKET_ROOM_LOBBY)
    await this.gameService.addPlayer(roomUuid, { ...emptyPlayer, user: socket.id })
    const game = await this.gameService.getGame(roomUuid)
    socket.to(roomUuid).emit('event', connectToRoomSuccessAction({ game }))
    socket.emit('event', connectToRoomSuccessAction({ game }))
  }
}
