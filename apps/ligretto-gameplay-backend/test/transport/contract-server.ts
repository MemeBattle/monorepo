import 'reflect-metadata'
import { Buffer } from 'node:buffer'
import { Container } from 'inversify'
import type { ExtendedError, Server, ServerOptions, Socket } from 'socket.io'
import { createSocketServer } from '../../src/create-socket-server'
import { IOC_TYPES } from '../../src/IOC_TYPES'
import type { SocketEngine } from '../../src/socket-engine/socket-engine'

/** The options a test passes through either host. `engine` ones reach the Workers engine, on Node they reach `attach`. */
export type ContractOptions = Partial<
  Pick<ServerOptions, 'pingInterval' | 'pingTimeout' | 'maxHttpBufferSize' | 'connectTimeout' | 'connectionStateRecovery'>
>

export interface ContractRecord {
  event: 'connection' | 'disconnecting' | 'disconnect' | 'error' | 'connection_error'
  socketId?: string
  userId?: string
  reason?: string
  rooms?: string[]
  recovered?: boolean
  code?: number
}

export type ControlCommand =
  | { type: 'log' }
  | { type: 'rooms' }
  | { type: 'emitToRoom'; room: string; event: string; payload: unknown }
  | { type: 'emitToAll'; event: string; payload: unknown }
  | { type: 'disconnectSocket'; socketId: string; close: boolean }
  | { type: 'closeTransport'; socketId: string }
  | { type: 'revoke'; token: string }
  | { type: 'unrevoke'; token: string }
  | { type: 'middlewareRuns' }
  | { type: 'stats' }
  | { type: 'shutdown' }

export interface ContractServer {
  control(command: ControlCommand): Promise<unknown>
}

const USER_TOKEN = /^valid:(.+)$/

type Ack = (...args: unknown[]) => void

export const createContractServer = (engine: SocketEngine, options: ContractOptions): ContractServer => {
  const log: ContractRecord[] = []
  const revoked = new Set<string>()
  let middlewareRuns = 0
  let shutDown = false

  const authorize = async (socket: Socket, next: (error?: ExtendedError) => void) => {
    middlewareRuns++
    await Promise.resolve()
    const token: unknown = socket.handshake.auth.token
    if (typeof token !== 'string') {
      return next(new Error('Missing token'))
    }
    const userId = USER_TOKEN.exec(token)?.[1]
    if (userId === undefined || revoked.has(token)) {
      const error: ExtendedError = new Error('Not authorized')
      error.data = { code: 'invalid_token' }
      return next(error)
    }
    socket.data.userId = userId
    next()
  }

  const handleConnection = (socket: Socket) => {
    const record = (event: ContractRecord['event'], reason?: string) =>
      log.push({ event, reason, socketId: socket.id, userId: socket.data.userId, rooms: [...socket.rooms], recovered: socket.recovered })

    record('connection')
    socket.on('error', (error: Error) => record('error', error.message))
    socket.on('disconnecting', reason => record('disconnecting', reason))
    socket.on('disconnect', reason => record('disconnect', reason))

    socket.on('echo', (payload: unknown, ack: Ack) => ack(payload))
    socket.on('whoami', (ack: Ack) =>
      ack({ id: socket.id, data: socket.data, rooms: [...socket.rooms], recovered: socket.recovered, auth: socket.handshake.auth }),
    )
    socket.on('remember', (value: unknown, ack: Ack) => {
      socket.data.remembered = value
      ack()
    })
    socket.on('handshake', (ack: Ack) => {
      const { headers, query, url, address, secure } = socket.handshake
      ack({ headers, query, url, address, secure, transport: socket.conn.transport.name })
    })
    socket.on('join', async (room: string, ack: Ack) => {
      await socket.join(room)
      ack()
    })
    socket.on('leave', async (room: string, ack: Ack) => {
      await socket.leave(room)
      ack()
    })
    socket.on('toRoom', (room: string, event: string, payload: unknown, ack: Ack) => {
      socket.to(room).emit(event, payload)
      ack()
    })
    socket.on('broadcast', (event: string, payload: unknown, ack: Ack) => {
      socket.broadcast.emit(event, payload)
      ack()
    })
    socket.on('askClient', async (event: string, timeoutMs: number, ack: Ack) => {
      try {
        ack({ answer: await socket.timeout(timeoutMs).emitWithAck(event) })
      } catch {
        ack({ timedOut: true })
      }
    })
    socket.on('binary', (bytes: unknown, ack: Ack) => ack({ isBuffer: Buffer.isBuffer(bytes) }, bytes))
    socket.on('message', (data: { type: string; payload: unknown }) => socket.emit(data.type, data.payload))
  }

  const connect = (io: Server) => {
    io.engine.on('connection_error', ({ code }: { code: number }) => log.push({ event: 'connection_error', code }))
    io.use(authorize).on('connection', handleConnection)
  }

  const container = new Container()
  container.bind<SocketEngine>(IOC_TYPES.SocketEngine).toConstantValue(engine)
  container.bind(IOC_TYPES.WebSocketHandler).toConstantValue({ connect })

  const io = createSocketServer(container, { ...options, serveClient: false })

  const socketById = (socketId: string) => {
    const socket = io.sockets.sockets.get(socketId)
    if (!socket) {
      throw new Error(`No socket ${socketId}`)
    }
    return socket
  }

  const control = async (command: ControlCommand): Promise<unknown> => {
    switch (command.type) {
      case 'log':
        return log
      case 'rooms':
        return Object.fromEntries([...io.sockets.adapter.rooms].map(([room, members]) => [room, [...members]]))
      case 'emitToRoom':
        io.to(command.room).emit(command.event, command.payload)
        return null
      case 'emitToAll':
        io.emit(command.event, command.payload)
        return null
      case 'disconnectSocket':
        socketById(command.socketId).disconnect(command.close)
        return null
      case 'closeTransport':
        socketById(command.socketId).conn.close()
        return null
      case 'revoke':
        revoked.add(command.token)
        return null
      case 'unrevoke':
        revoked.delete(command.token)
        return null
      case 'middlewareRuns':
        return middlewareRuns
      case 'stats':
        return { clientsCount: io.engine.clientsCount, sockets: io.sockets.sockets.size }
      case 'shutdown':
        if (!shutDown) {
          shutDown = true
          await io.close()
        }
        return null
    }
  }

  return { control }
}
