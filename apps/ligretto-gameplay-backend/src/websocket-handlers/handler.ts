import * as Sentry from '@sentry/node'
import { injectable, inject } from 'inversify'
import type { Server, Socket } from 'socket.io'
import { IOC_TYPES } from '../IOC_TYPES'
import { GameplayController } from '../controllers/gameplay-controller'
import { GamesController } from '../controllers/games-controller'
import { UserService } from '../entities/user'
import { BotController } from '../controllers/bot-controller'
import { authMiddleware } from '../middlewares'
import type { AnyAction } from '../types/any-action'
import { socketIOConnectionsCountMetric, socketIOConnectionsCountTotalMetric } from '../metrics'

export interface WebSocketHandler {
  connectionHandler(socket: Socket): void
}

@injectable()
export class WebSocketHandler implements WebSocketHandler {
  @inject(IOC_TYPES.GameplayController) private gameplayController: GameplayController
  @inject(IOC_TYPES.GamesController) private gamesController: GamesController
  @inject(IOC_TYPES.BotController) private botController: BotController
  @inject(IOC_TYPES.UserService) private userService: UserService

  connect(socketServer: Server) {
    socketServer.use(authMiddleware).on('connection', socket => this.connectionHandler(socket))
  }

  public async connectionHandler(socket: Socket): Promise<void> {
    Sentry.runWithAsyncContext(async () => {
      socketIOConnectionsCountMetric.inc()
      socketIOConnectionsCountTotalMetric.inc()

      socket.on('message', data => {
        if (!data || !data.hasOwnProperty('type') || typeof data.type !== 'string') {
          console.error('data should contain type', data)
          Sentry.captureException('WebSocker message without type')
          return
        }
        this.messageHandler(socket, data)
      })

      socket.on('echo', data => {
        console.log('ECHO', data)
        socket.emit(data.type, data.payload)
      })

      socket.on('disconnecting', async () => {
        await this.gamesController.disconnectionHandler(socket)
        await this.userService.disconnectionHandler({ socketId: socket.id, userId: socket.data.user.id })
      })

      socket.on('disconnect', () => {
        socketIOConnectionsCountMetric.dec()
      })

      await this.userService.connectUser({ socketId: socket.id, userId: socket.data.user.id })
    })
  }

  private messageHandler(socket: Socket, data: AnyAction) {
    this.gameplayController.handleMessage(socket, data)
    this.gamesController.handleMessage(socket, data)
    this.botController.handleMessage(socket, data)
  }
}
