import { injectable, inject } from 'inversify'
import { Socket } from 'socket.io'
import { Controller } from './controller'
import { GameplayTypes } from '@memebattle/ligretto-shared'
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
  }

  private async startGame(socket: Socket, action) {
    const gameId = action.payload.gameId;

    this.gameplayOutput.listenGame(gameId, game => {
      socket.to(gameId).emit('event', game);
    })

    await this.gameplay.startGame(gameId);
  }

  private async endGame(socket: Socket, action) {
    const gameId = action.payload.gameId;

    this.gameplayOutput.unlistenGame(action.payload.gameId);
    const results = await this.gameplay.endGame(gameId);

    socket.to(gameId).emit('event', results);
  }
}
