import type { removeBotAction } from '@memebattle/ligretto-shared'
import { addBotAction } from '@memebattle/ligretto-shared'
import type { Socket } from 'socket.io'
import { inject, injectable } from 'inversify'
import { initBot, stopBot } from '../bot'
import { IOC_TYPES } from '../IOC_TYPES'
import { GameService } from '../entities/game/game.service'
import { Controller } from './controller'

@injectable()
export class BotController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService

  handlers: Controller['handlers'] = {
    [addBotAction.type]: (socket, action) => this.addBotToGame(socket, action),
  }

  private addBotToGame(socket: Socket, action: ReturnType<typeof addBotAction>) {
    const gameId = action.payload.gameId

    initBot(socket, gameId)
  }

  private removeBotFromGame(socket: Socket, action: ReturnType<typeof removeBotAction>) {
    const { botId, gameId } = action.payload
    this.gameService.leaveGame(gameId, botId)

    stopBot(botId)
  }
}
