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
    ['START_GAME']: (socket, action) => this.startGame(socket, action),
  }

  private startGame(socket: Socket, action: any) {
    console.log('START_GAME handler')
    console.log(action)
    console.log(this)
    this.gameService.createGame('123')
  }

  putCard(socket: Socket, action: any) {
    console.log('START_GAME handler')
  }
}
