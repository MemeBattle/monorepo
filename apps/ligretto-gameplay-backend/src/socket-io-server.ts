import { createServer } from 'node:http'
import { CONNECTION_STATE_RECOVERY_TIMEOUT_MS, LIGRETTO_GAMEPLAY_SOCKET_PORT } from './config'
import { createSocketServer } from './create-socket-server'
import { IOC } from './inversify.config'
import { IOC_TYPES } from './IOC_TYPES'
import { promClient } from './metrics'
import { NodeSocketEngine } from './socket-engine/node-socket-engine'
import type { SocketEngine } from './socket-engine/socket-engine'

const httpServer = createServer(async (req, res) => {
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

IOC.bind<SocketEngine>(IOC_TYPES.SocketEngine).toConstantValue(new NodeSocketEngine(httpServer))

export const io = createSocketServer(IOC, {
  serveClient: false,
  connectionStateRecovery: {
    maxDisconnectionDuration: CONNECTION_STATE_RECOVERY_TIMEOUT_MS,
    skipMiddlewares: false,
  },
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

httpServer.listen(LIGRETTO_GAMEPLAY_SOCKET_PORT, () => {
  console.log(`Ligretto gameplay started on ${LIGRETTO_GAMEPLAY_SOCKET_PORT}`)
})

const shutdown = (signal: NodeJS.Signals) => {
  // Force exit if io.close() never completes (e.g. a stuck connection keeps the http server open)
  setTimeout(() => process.exit(1), 3000).unref()
  void io.close(() => {
    console.log(`Server closed ${signal}`)
    process.exit()
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
