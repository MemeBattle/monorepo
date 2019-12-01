import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Controller } from './controller'
import { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { searchRoomsFinishAction, RoomsTypes, CreateRoomEmitAction, SearchRoomsEmitAction, updateRooms } from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'

@injectable()
export class GamesController extends Controller {
  @inject(TYPES.GameService) private gameService: GameService

  handlers = {
    [RoomsTypes.CREATE_ROOM_EMIT]: (socket, action) => this.createGame(socket, action),
    [RoomsTypes.SEARCH_ROOMS_EMIT]: (socket, action) => this.searchRooms(socket, action),
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
}
