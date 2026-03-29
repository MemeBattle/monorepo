import type { Socket } from 'socket.io'
import { injectable } from 'inversify'
import type { AnyAction } from '../types/any-action'

type MaybePromise<T> = T | Promise<T>
@injectable()
export abstract class Controller {
  protected abstract handlers: {
    [actionType: string]: <A extends AnyAction>(socket: Socket, action: A) => MaybePromise<unknown>
  }

  private getHandler(type: string) {
    return this.handlers[type]
  }

  handleMessage(socket: Socket, action: AnyAction): MaybePromise<unknown> {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }
}
