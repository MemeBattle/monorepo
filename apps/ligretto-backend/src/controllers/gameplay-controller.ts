import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Gameplay } from '../gameplay/gameplay'
import { Controller } from './controller'
import { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'
import { dto } from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay
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

    const rooms = await this.gameService.findGames(action.search)
    socket.emit('search rooms', { search: action.search, rooms, type: 'SEARCH_ROOMS_FINISH' })
  }
}
