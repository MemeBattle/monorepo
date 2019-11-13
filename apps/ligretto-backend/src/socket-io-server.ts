import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'
import { WebSocketHandler, Emmiter } from './websocket-handlers'
import { IOC } from './inversify.config'
import { TYPES } from './types'

export const server = SocketIo(SOCKET_PORT)

export const webSocketHandler = IOC.get<WebSocketHandler>(TYPES.WebSocketHandler)
export const emmiter = IOC.get<Emmiter>(TYPES.Emmiter)

webSocketHandler.connect(server)
emmiter.init()
