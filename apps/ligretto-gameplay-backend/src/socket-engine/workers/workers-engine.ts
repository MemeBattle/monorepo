import { EventEmitter } from 'node:events'
import type { Server } from 'socket.io'
import type { SocketEngine } from '../socket-engine'
import { isWebSocketUpgrade, SERVER_CLOSED, toEngineRequest, verifyHandshake } from './handshake'
import type { EngineRequest, HandshakeRefusal } from './handshake'
import { WorkersConnection } from './workers-connection'
import type { ConnectionOptions, ConnectionSocket } from './workers-connection'
import type { Request as WorkersRequest } from '@cloudflare/workers-types'

declare const WebSocketPair: typeof import('@cloudflare/workers-types').WebSocketPair
declare const Response: typeof import('@cloudflare/workers-types').Response
type Response = import('@cloudflare/workers-types').Response

/** An `engine.io` server for `io.bind()` that takes its connections from a Durable Object's `fetch`. */
export class WorkersEngine extends EventEmitter implements SocketEngine {
  readonly clients: Record<string, WorkersConnection> = {}
  clientsCount = 0

  private readonly options: ConnectionOptions
  private closed = false

  constructor({ pingInterval = 25_000, pingTimeout = 20_000, maxHttpBufferSize = 1e6 }: Partial<ConnectionOptions> = {}) {
    super()
    this.options = { pingInterval, pingTimeout, maxHttpBufferSize }
  }

  attachTo(io: Server) {
    io.bind(this)
  }

  handleRequest(request: WorkersRequest): Response {
    const engineRequest = toEngineRequest(request)
    if (this.closed) {
      return this.refuse(engineRequest, SERVER_CLOSED, 503)
    }
    const refusal = verifyHandshake(engineRequest, isWebSocketUpgrade(engineRequest))
    if (refusal) {
      return this.refuse(engineRequest, refusal, 400)
    }

    const { 0: client, 1: server } = new WebSocketPair()
    // The runtime's default is `Blob`, which Socket.IO cannot read synchronously.
    server.binaryType = 'arraybuffer'
    server.accept()
    this.openConnection(server, engineRequest)

    // Also for a connection that did not survive `start()`: the upgrade is accepted, and the peer sees the closed socket.
    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * The order matters. The connection is registered and its removal subscribed before `start()`, because the `open`
   * send can close it. Socket.IO hears only of a connection that is still open, so a failed one leaves no `Client` and
   * no `connectTimeout`.
   */
  openConnection(socket: ConnectionSocket, request: EngineRequest) {
    const connection = new WorkersConnection(crypto.randomUUID(), socket, request, this.options)

    this.clients[connection.id] = connection
    this.clientsCount++
    connection.once('close', () => {
      delete this.clients[connection.id]
      this.clientsCount--
    })

    connection.start()
    if (connection.readyState === 'open') {
      this.emit('connection', connection)
    }
    return connection
  }

  /** `io.close()` refuses new connections only through an HTTP server, and `bind` leaves it without one. */
  close() {
    this.closed = true
    for (const connection of Object.values(this.clients)) {
      connection.close(true)
    }
    return this
  }

  private refuse(req: EngineRequest, refusal: HandshakeRefusal, status: number) {
    const { code, message } = refusal
    this.emit('connection_error', { req, ...refusal })
    return new Response(JSON.stringify({ code, message }), { status, headers: { 'Content-Type': 'application/json' } })
  }
}
