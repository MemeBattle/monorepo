import { Socket } from 'socket.io'
import { injectable } from 'inversify'

export const onAction = (type: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    target.handlers = target.handlers ? { ...target.handlers, [type]: propertyKey } : { [type]: propertyKey }

    return descriptor
  }
}

@injectable()
export class Controller {
  private handlers: { [actionType: string]: string } = {}

  private getHandler(type: string) {
    const methodName = this.handlers[type]

    return this[methodName]
  }

  handleMessage(socket: Socket, action: { type: string; payload: any }): void {
    const handler = this.getHandler(action.type)
    console.log(this.handlers)
    console.log(action)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }
}
