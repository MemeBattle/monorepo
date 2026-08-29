import { injectable, inject } from 'inversify'
import type { Server, Socket } from 'socket.io'
import { IOC_TYPES } from '../IOC_TYPES'
import type { GameplayController } from '../controllers/gameplay-controller'
import type { GamesController } from '../controllers/games-controller'
import type { UserService } from '../entities/user'
import type { BotController } from '../controllers/bot-controller'
import { authMiddleware } from '../middlewares'
import type { AnyAction } from '../types/any-action'
import { socketIOConnectionsCountMetric, socketIOConnectionsCountTotalMetric } from '../metrics'

@injectable()
export class WebSocketHandler {
  @inject(IOC_TYPES.GameplayController) private gameplayController: GameplayController
  @inject(IOC_TYPES.GamesController) private gamesController: GamesController
  @inject(IOC_TYPES.BotController) private botController: BotController
  @inject(IOC_TYPES.UserService) private userService: UserService

  connect(socketServer: Server) {
    socketServer.use(authMiddleware).on('connection', socket => this.connectionHandler(socket))
  }

  public connectionHandler(socket: Socket): void {
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

    socket.on('disconnecting', reason => {
      const disconnectUser = () => this.userService.disconnectionHandler({ socketId: socket.id, userId: socket.data.userId })
      if (reason === 'client namespace disconnect') {
        this.gamesController.disconnectionHandler(socket, reason)
        disconnectUser()
        return
      }
      // For transport-level disconnects the socket must be removed from the
      // user's live sockets first, so the lifecycle sees the user as offline.
      disconnectUser()
      this.gamesController.disconnectionHandler(socket, reason)
    })

    socket.on('disconnect', () => {
      socketIOConnectionsCountMetric.dec()
    })

    this.userService.connectUser({ socketId: socket.id, userId: socket.data.userId })
  }

  private messageHandler(socket: Socket, data: AnyAction) {
    void this.gameplayController.handleMessage(socket, data)
    void this.gamesController.handleMessage(socket, data)
    void this.botController.handleMessage(socket, data)
  }
}
