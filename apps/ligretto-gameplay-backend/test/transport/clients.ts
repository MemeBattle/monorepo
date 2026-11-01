import { afterEach, vi } from 'vitest'
import { io } from 'socket.io-client'
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client'
import type { TransportHost } from './hosts'

export type ClientOptions = Partial<ManagerOptions & SocketOptions>

const clients = new Set<Socket>()
const rawConnections = new Set<WebSocket>()

afterEach(() => {
  for (const client of clients) {
    client.disconnect()
  }
  clients.clear()
  for (const connection of rawConnections) {
    connection.close()
  }
  rawConnections.clear()
})

export const connect = (host: TransportHost, options: ClientOptions = {}) => {
  const client = io(host.url, { transports: ['websocket'], path: host.path, forceNew: true, reconnection: false, ...options })
  clients.add(client)
  return client
}

/** Resolves on `connect`, rejects on `connect_error`. */
export const connected = (client: Socket) =>
  new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })

export const connectedClient = async (host: TransportHost, token = 'valid:user', options: ClientOptions = {}) => {
  const client = connect(host, { auth: { token }, ...options })
  await connected(client)
  return client
}

export const nextEvent = <Payload = unknown>(client: Socket, event: string) => new Promise<Payload>(resolve => client.once(event, resolve))

/** Every value `event` delivers, live. */
export const collect = <Payload = unknown>(client: Socket, event: string) => {
  const values: Payload[] = []
  client.on(event, (value: Payload) => values.push(value))
  return values
}

/** The only way to see packets the client buffers before CONNECT. */
export const recordPackets = (client: Socket) => {
  const packets: { type: number; data?: unknown }[] = []
  client.io.on('packet', ({ type, data }) => packets.push({ type, data }))
  return packets
}

/**
 * Makes the client stop seeing pings while the server keeps getting its pongs, so that the client's own deadline, and
 * not the server's, ends the connection. `engine.io-client`'s `_onPacket` and `_sendPacket` are private: there is no
 * public seam for it.
 */
export const dropPings = (client: Socket) => {
  const engine = client.io.engine as unknown as {
    transport: { off(event: 'packet'): void; on(event: 'packet', listener: (packet: { type: string }) => void): void }
    _onPacket(packet: { type: string }): void
    _sendPacket(type: string): void
  }
  engine.transport.off('packet')
  engine.transport.on('packet', packet => {
    if (packet.type === 'ping') {
      engine._sendPacket('pong')
      return
    }
    engine._onPacket(packet)
  })
}

export interface RawConnection {
  socket: WebSocket
  frames: (string | ArrayBuffer)[]
  /** Resolves with the `open` packet's payload. */
  open(): Promise<{ sid: string; upgrades: string[]; pingInterval: number; pingTimeout: number; maxPayload: number }>
  closed: Promise<{ code: number }>
  frame(predicate: (frame: string | ArrayBuffer) => boolean): Promise<string | ArrayBuffer>
  sentAndClosed(frame: string | ArrayBuffer): Promise<{ code: number }>
}

/** A WebSocket speaking Engine.IO by hand, for what `socket.io-client` will not send. */
export const rawConnection = (host: TransportHost, { protocol = 4 }: { protocol?: number } = {}): RawConnection => {
  const url = new URL(host.url)
  url.protocol = 'ws:'
  url.pathname = host.path
  url.search = `?EIO=${protocol}&transport=websocket`

  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'
  rawConnections.add(socket)

  const frames: (string | ArrayBuffer)[] = []
  socket.addEventListener('message', ({ data }) => frames.push(data as string | ArrayBuffer))

  const frame: RawConnection['frame'] = predicate =>
    vi.waitFor(
      () => {
        const found = frames.find(predicate)
        if (found === undefined) {
          throw new Error('no such frame yet')
        }
        return found
      },
      { timeout: 5_000, interval: 10 },
    )

  const closed = new Promise<{ code: number }>(resolve => socket.addEventListener('close', ({ code }) => resolve({ code })))

  return {
    socket,
    frames,
    closed,
    frame,
    open: async () => JSON.parse(String(await frame(value => typeof value === 'string' && value.startsWith('0'))).slice(1)),
    sentAndClosed: frameToSend => {
      socket.send(frameToSend)
      return closed
    },
  }
}

/** Connects a raw connection to the main namespace, so that the server holds a socket for it. */
export const rawSocket = async (host: TransportHost, token = 'valid:raw', options: { protocol?: number } = {}) => {
  const connection = rawConnection(host, options)
  await connection.open()
  connection.socket.send(`40${JSON.stringify({ token })}`)
  await connection.frame(value => typeof value === 'string' && value.startsWith('40'))
  return connection
}

/** Polls the host, so that a test waits on state and not on a sleep. */
export const waitFor = <Result>(check: () => Promise<Result>) => vi.waitFor(check, { timeout: 5_000, interval: 20 })
