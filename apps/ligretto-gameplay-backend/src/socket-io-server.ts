import { Server } from 'socket.io'
import { createServer } from 'http'
import { SOCKET_PORT } from './config'
import type { WebSocketHandler } from './websocket-handlers'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'

console.log('socket port', SOCKET_PORT)

const httpServer = createServer()

export const io = new Server(httpServer, {
  serveClient: false,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

export const webSocketHandler = IOC.get<WebSocketHandler>(IOC_TYPES.WebSocketHandler)

webSocketHandler.connect(io)

httpServer.listen(SOCKET_PORT || 3005)
