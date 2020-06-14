import { injectable, inject } from 'inversify'
import { Socket } from 'socket.io'
import { Controller } from './controller'
import { GameplayTypes, updateGameAction, StartGameEmitAction, PutCardAction } from '@memebattle/ligretto-shared'
import { TYPES } from '../types'
import { Gameplay } from '../gameplay/gameplay'
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay
  @inject(TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  handlers = {
    [GameplayTypes.START_GAME]: (socket, action) => this.startGame(socket, action),
    [GameplayTypes.END_GAME]: (socket: Socket, action) => this.endGame(socket, action),
    [GameplayTypes.PUT_CARD]: (socket: Socket, action) => this.putCard(socket, action),
  }

  private async startGame(socket: Socket, action: StartGameEmitAction) {
    const gameId = action.payload.gameId

    this.gameplayOutput.listenGame(gameId, game => {
      const action = updateGameAction(game)
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    })

    await this.gameplay.startGame(gameId)
  }

  private async endGame(socket: Socket, action) {
    const gameId = action.payload.gameId

    this.gameplayOutput.unlistenGame(action.payload.gameId)
    const results = await this.gameplay.endGame(gameId)

    socket.to(gameId).emit('event', results)
  }

  private async putCard(socket: Socket, action: PutCardAction) {
    const { gameId, cardIndex } = action.payload

    this.gameplay.playerPutCard(gameId, socket.id, cardIndex)
  }
}
