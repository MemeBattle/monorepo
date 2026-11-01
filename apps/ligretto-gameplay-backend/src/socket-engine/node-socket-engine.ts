import type { Server as HttpServer } from 'node:http'
import type { Server } from 'socket.io'
import type { SocketEngine } from './socket-engine'

export class NodeSocketEngine implements SocketEngine {
  constructor(private readonly httpServer: HttpServer) {}

  attachTo(io: Server) {
    io.attach(this.httpServer)
  }
}
