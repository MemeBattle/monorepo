import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Gameplay } from '../gameplay/gameplay'
import { Controller } from './controller'
import { Socket } from 'socket.io'
import { GameService } from '../entities/game/game.service'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay
  @inject(TYPES.GameService) private gameService: GameService

  handlers = {
    ['CREATE_NEW_ROOM']: (socket, action) => this.createGame(socket, action),
  }

  private async createGame(socket: Socket, action: any) {
    console.log('action', action)
    const game = await this.gameService.createGame('123')
    socket.emit('Game created', game)
  }
}
