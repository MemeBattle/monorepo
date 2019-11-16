import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'
import { WebSocketHandler, Emitter } from './websocket-handlers'
import { IOC } from './inversify.config'
import { TYPES } from './types'

export const server = SocketIo(SOCKET_PORT)

export const webSocketHandler = IOC.get<WebSocketHandler>(TYPES.WebSocketHandler)
export const emitter = IOC.get<Emitter>(TYPES.Emitter)

webSocketHandler.connect(server)
emitter.init()
