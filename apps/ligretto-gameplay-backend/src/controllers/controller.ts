import type { Socket } from 'socket.io'
import { injectable } from 'inversify'
import type { AnyAction } from '../types/any-action'

export interface IController {
  handleMessage: (socket: Socket, action: AnyAction) => void
}

// XXX: Is there the necessity of IController
@injectable()
export abstract class Controller implements IController {
  protected abstract handlers: {
    [actionType: string]: <A extends AnyAction>(socket: Socket, action: A) => void
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
