import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'
import type { WebSocketHandler } from './websocket-handlers'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'

export const server = SocketIo(SOCKET_PORT)
server.origins('*:*')

export const webSocketHandler = IOC.get<WebSocketHandler>(IOC_TYPES.WebSocketHandler)

webSocketHandler.connect(server)
