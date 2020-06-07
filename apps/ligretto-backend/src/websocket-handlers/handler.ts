import { injectable, inject } from 'inversify'
import { Server, Socket } from 'socket.io'
import { TYPES } from '../types'
import { GameplayController } from '../controllers/gameplay-controller'
import { GamesController } from '../controllers/games-controller'
import { UserService } from '../entities/user'

export interface WebSocketHandler {
  connectionHandler(socket: Socket): void
}

@injectable()
export class WebSocketHandler implements WebSocketHandler {
  @inject(TYPES.GameplayController) private gameplayController: GameplayController
  @inject(TYPES.GamesController) private gamesController: GamesController
  @inject(TYPES.UserService) private userService: UserService // Возможно нужен контроллер, но пока хз

  connect(socketServer: Server) {
    socketServer.on('connection', socket => this.connectionHandler(socket))
  }

  public connectionHandler(socket: Socket): void {
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
      await this.userService.removeUser(socket.id)
    })

    this.userService.addUser(socket.id)
  }

  private messageHandler(socket: Socket, data: { type: string; payload: unknown }) {
    console.log('Action', data)
    this.gameplayController.handleMessage(socket, data)
    this.gamesController.handleMessage(socket, data)
  }
}
