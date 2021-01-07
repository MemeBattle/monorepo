import { AddBotAction, RemoveBotAction, BotTypes } from '@memebattle/ligretto-shared'
import { Socket } from 'socket.io'
import { inject, injectable } from 'inversify'
import { initBot, stopBot } from '../bot'
import { IOC_TYPES } from '../IOC_TYPES'
import { GameService } from '../entities/game/game.service'
import { Controller } from './controller'

@injectable()
export class BotController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService

  handlers = {
    [BotTypes.ADD_BOT_EMIT]: (socket, action) => this.addBotToGame(socket, action),
  }

  private addBotToGame(socket: Socket, action: AddBotAction) {
    const gameId = action.payload.gameId

    initBot(socket, gameId)
  }

  private removeBotFromGame(socket: Socket, action: RemoveBotAction) {
    const { botId, gameId } = action.payload
    this.gameService.leaveGame(gameId, botId)

    stopBot(botId)
  }
}
