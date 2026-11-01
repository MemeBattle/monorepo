import type { Container } from 'inversify'
import { Server } from 'socket.io'
import type { ServerOptions } from 'socket.io'
import { IOC_TYPES } from './IOC_TYPES'
import type { SocketEngine } from './socket-engine/socket-engine'
import type { WebSocketHandler } from './websocket-handlers'

export const createSocketServer = (container: Container, options: Partial<ServerOptions>) => {
  const io = new Server(options)
  container.get<SocketEngine>(IOC_TYPES.SocketEngine).attachTo(io)
  container.get<Pick<WebSocketHandler, 'connect'>>(IOC_TYPES.WebSocketHandler).connect(io)
  return io
}
