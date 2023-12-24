import { injectable, inject, named } from 'inversify'
import type { Server, Socket } from 'socket.io'
import { IOC_TYPES } from '../IOC_TYPES'
import { IGamesController } from '../controllers/games-controller'
import { IUserService } from '../entities/user'
import { IController } from '../controllers/controller'
import { authMiddleware } from '../middlewares'
import type { AnyAction } from '../types/any-action'
import { socketIOConnectionsCountMetric, socketIOConnectionsCountTotalMetric } from '../metrics'

export interface IWebSocketHandler {
  connect(socketServer: Server): void
}

@injectable()
export class WebSocketHandler implements IWebSocketHandler {
  @inject(IOC_TYPES.IController) @named('gameplayController') private gameplayController: IController
  @inject(IOC_TYPES.IGamesController) private gamesController: IGamesController
  @inject(IOC_TYPES.IController) @named('botController') private botController: IController
  @inject(IOC_TYPES.IUserService) private userService: IUserService

  connect(socketServer: Server) {
    socketServer.use(authMiddleware).on('connection', socket => this.connectionHandler(socket))
  }

  // XXX: why is this method public? It is used only inside itself
  private async connectionHandler(socket: Socket): Promise<void> {
    socketIOConnectionsCountMetric.inc()
    socketIOConnectionsCountTotalMetric.inc()

    socket.on('message', data => {
      if (!data || !data.hasOwnProperty('type') || typeof data.type !== 'string') {
        console.error('data should contain type', data)
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
  }

  private messageHandler(socket: Socket, data: AnyAction) {
    this.gameplayController.handleMessage(socket, data)
    this.gamesController.handleMessage(socket, data)
    this.botController.handleMessage(socket, data)
  }
}
