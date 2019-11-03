import { injectable, inject } from 'inversify'
import { Socket } from 'socket.io'
import { TYPES } from '../types'
import { GameplayController } from '../controllers/gameplay-controller'

export interface WebSocketHandler {
  connectionHandler(socket: Socket): void
}

@injectable()
export class WebSocketHandler implements WebSocketHandler {
  @inject(TYPES.GameController) private gameController: GameplayController

  public connectionHandler(socket: Socket): void {
    socket.on('message', data => {
      if (!data.hasOwnProperty('type') || typeof data.type !== 'string') {
        console.error('data should contain type')
        return
      }
      this.messageHandler(data)
    })

    socket.on('echo', data => {
      console.log('ECHO', data)
      socket.emit(data.type, data.payload)
    })
  }

  private messageHandler(data: { type: string; payload: any }) {
    switch (data.type) {
      default:
        console.error('Unhandled type', data.type)
    }
  }
}
