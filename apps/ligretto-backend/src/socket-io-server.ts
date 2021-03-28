import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'
import type { WebSocketHandler } from './websocket-handlers'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'

console.log('socket port', SOCKET_PORT)

export const server = SocketIo(SOCKET_PORT || 3005, { serveClient: false })
server.origins('*:*')

export const webSocketHandler = IOC.get<WebSocketHandler>(IOC_TYPES.WebSocketHandler)

webSocketHandler.connect(server)
