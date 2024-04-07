import { Server } from 'socket.io'
import { createServer } from 'node:http'
import { LIGRETTO_GAMEPLAY_SOCKET_PORT } from './config'
import type { WebSocketHandler } from './websocket-handlers'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'
import { promClient } from './metrics'
import * as Sentry from '@sentry/node'

const httpServer = createServer(async (req, res) => {
  Sentry.runWithAsyncContext(async () => {
    switch (req.url) {
      case '/metrics':
        res.writeHead(200)
        res.end(await promClient.register.metrics())
        break
      case '/health':
        res.writeHead(200)
        res.end()
        break
      default:
        res.writeHead(404)
        res.end()
    }
  })
})

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
  io.close(() => {
    console.log('Server closed SIGTERM')
    process.exit()
  })
})

process.on('SIGINT', () => {
  io.close(() => {
    console.log('Server closed SIGINT')
    process.exit()
  })
})
