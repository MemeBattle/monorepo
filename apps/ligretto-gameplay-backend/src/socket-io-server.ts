import { Server } from 'socket.io'
import { createServer } from 'http'
import { LIGRETTO_GAMEPLAY_SOCKET_PORT } from './config'
import type { WebSocketHandler } from './websocket-handlers'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'

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

httpServer.listen(LIGRETTO_GAMEPLAY_SOCKET_PORT, () => {
  console.log(`Ligretto gameplay started on ${LIGRETTO_GAMEPLAY_SOCKET_PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Server closed SIGTERM')
  httpServer.close()
})

process.on('SIGINT', () => {
  console.log('Server closed SIGINT')
  httpServer.close()
})
