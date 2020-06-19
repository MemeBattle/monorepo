import { injectable, inject } from 'inversify'
import { Socket } from 'socket.io'
import { Controller } from './controller'
import { TechConnectToGame, TechTypes, updateGameAction } from '@memebattle/ligretto-shared'
import { TYPES } from '../types'
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class TechController extends Controller {
  @inject(TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  handlers = {
    [TechTypes.CONNECT_TO_GAME]: (socket: Socket, action: TechConnectToGame) => this.techConnectToGame(socket, action),
  }

  private async techConnectToGame(socket: Socket, action: TechConnectToGame) {
    const gameId = action.payload.gameId
    console.log('techConnectToGame', gameId)
    socket.join(gameId)

    this.gameplayOutput.listenGame(gameId, game => {
      const action = updateGameAction(game)
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    })
  }
}
