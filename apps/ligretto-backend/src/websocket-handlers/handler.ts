import { injectable, inject } from 'inversify'
import { Server, Socket } from 'socket.io'
import { TYPES } from '../types'
import { GameplayController } from '../controllers/gameplay-controller'

export interface WebSocketHandler {
  connectionHandler(socket: Socket): void
}

@injectable()
export class WebSocketHandler implements WebSocketHandler {
  @inject(TYPES.GameplayController) private gameplayController: GameplayController

  connect(socketServer: Server) {
    socketServer.on('connection', socket => this.connectionHandler(socket))
  }

  public connectionHandler(socket: Socket): void {
    socket.on('message', data => {
      if (!data || !data.hasOwnProperty('type') || typeof data.type !== 'string') {
        console.error('data should contain type')
        return
      }
      this.messageHandler(socket, data)
    })

    socket.on('echo', data => {
      console.log('ECHO', data)
      socket.emit(data.type, data.payload)
    })
  }

  private messageHandler(socket: Socket, data: { type: string; payload: any }) {
    this.gameplayController.handleMessage(socket, data)
  }
}
