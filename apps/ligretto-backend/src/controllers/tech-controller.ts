import { injectable, inject } from 'inversify'
import type { Socket } from 'socket.io'
import { Controller } from './controller'
import { updateGameAction, techConnectToGame } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../IOC_TYPES'
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class TechController extends Controller {
  @inject(IOC_TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  handlers = {
    [techConnectToGame.type]: (socket: Socket, action: ReturnType<typeof techConnectToGame>) => this.techConnectToGame(socket, action),
  }

  private async techConnectToGame(socket: Socket, action: ReturnType<typeof techConnectToGame>) {
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
