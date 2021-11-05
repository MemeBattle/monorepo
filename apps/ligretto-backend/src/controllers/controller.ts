import type { Socket } from 'socket.io'
import { injectable } from 'inversify'
import type { AnyAction } from '../types/any-action'

@injectable()
export abstract class Controller {
  protected abstract handlers: {
    [actionType: string]: <T extends AnyAction>(socket: Socket, action: T) => void
  }

  private getHandler(type: string) {
    return this.handlers[type]
  }

  handleMessage(socket: Socket, action: AnyAction): void {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }
}
