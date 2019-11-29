import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Controller } from './controller'
import { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { dto, Room } from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'

@injectable()
export class GamesController extends Controller {
  @inject(TYPES.GameService) private gameService: GameService

  handlers = {
    ['CREATE_NEW_ROOM']: (socket, action) => this.createGame(socket, action),
    ['SEARCH_ROOMS']: (socket, action) => this.searchRooms(socket, action),
  }

  private async createGame(socket: Socket, action: dto.CreateGame) {
    console.log('action', action)
    const game = await this.gameService.createGame(action.name)
    socket.emit('Game created', game)
  }

  private async searchRooms(socket: Socket, action: dto.SearchRooms) {
    console.log(action)
    socket.join(SOCKET_ROOM_LOBBY)

    const games = await this.gameService.findGames(action.search)
    const payload: dto.SearchRoomsFinish = {
      type: '@@rooms/SEARCH_ROOMS_FINISH',
      payload: {
        search: action.search,
        rooms: games.map(
          (game): Room => ({
            uuid: game.id,
            name: game.name,
            playersCount: Object.keys(game.players).length,
            playersMaxCount: game.config.playersMaxCount,
          }),
        ),
      },
    }
    socket.emit('event', payload)
  }
}
