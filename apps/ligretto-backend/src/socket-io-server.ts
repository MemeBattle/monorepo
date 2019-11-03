import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'
import { WebSocketHandler } from './websocket-handlers'

const server = SocketIo(SOCKET_PORT)

const webSocketHandler = new WebSocketHandler()

server.on('connection', webSocketHandler.connectionHandler)
