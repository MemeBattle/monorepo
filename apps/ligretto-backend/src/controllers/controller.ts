import type { Socket } from 'socket.io'
import { injectable } from 'inversify'

@injectable()
export abstract class Controller {
  protected abstract handlers: {
    [actionType: string]: (socket: Socket, action: never) => void
  }

  private getHandler(type: string) {
    return this.handlers[type]
  }

  handleMessage(socket: Socket, action: { type: string; payload: unknown }): void {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return handler(socket, action)
    }
  }
}
