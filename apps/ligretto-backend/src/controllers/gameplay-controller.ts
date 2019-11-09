import { injectable, inject } from 'inversify'
import { TYPES } from '../types'
import { Gameplay } from '../gameplay/gameplay'
import { Controller } from './controller'
import { Socket } from 'socket.io'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay

  handlers = {
    ['START_GAME']: this.startGame,
  }

  startGame(socket: Socket, action: any) {
    console.log('START_GAME handler')
    console.log(action)
  }

  putCard(socket: Socket, action: any) {
    console.log('START_GAME handler')
  }
}
