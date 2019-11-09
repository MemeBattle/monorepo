import { Socket } from 'socket.io'

export const onAction = (type: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    target.handlers = target.handlers ? { ...target.handlers, [type]: propertyKey } : { [type]: propertyKey }

    return descriptor
  }
}

export class Controller {
  private handlers: { [actionType: string]: string } = {}

  private getHandler(type: string) {
    const methodName = this.handlers[type]

    return this[methodName]
  }

  handleMessage(socket: Socket, action: { type: string; payload: any }): void {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }
}
