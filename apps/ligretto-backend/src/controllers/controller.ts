import { Socket } from 'socket.io'
import { injectable } from 'inversify'

@injectable()
export abstract class Controller {
  protected abstract handlers: {
    [actionType: string]: (socket: Socket, action: any) => any
  }

  private getHandler(type: string) {
    return this.handlers[type]
  }

  handleMessage(socket: Socket, action: { type: string; payload: any }): void {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }
}
