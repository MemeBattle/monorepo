import { afterEach, describe, expect, it } from 'vitest'
import type { Socket } from 'socket.io-client'
import { collect, connect, connected, connectedClient, dropPings, nextEvent, rawConnection, rawSocket, recordPackets, waitFor } from './clients'
import type { ContractOptions, ContractRecord } from './contract-server'
import { startNodeHost, startWorkerdHost } from './hosts'
import type { TransportHost } from './hosts'

const SHORT_HEARTBEAT = { pingInterval: 300, pingTimeout: 300 }
const RECOVERY = { maxDisconnectionDuration: 2_000, skipMiddlewares: false }
const CONNECT_ERROR_PACKET = 4
const EVENT_PACKET = 2
const CONNECT_PACKET = 0

describe.each([
  ['node', startNodeHost],
  ['workerd', startWorkerdHost],
])('transport contract on %s', (_name, startHost) => {
  const hosts: TransportHost[] = []

  const start = async (options: ContractOptions = {}) => {
    const host = await startHost(options)
    hosts.push(host)
    return host
  }

  afterEach(async () => {
    await Promise.all(hosts.map(host => host.close()))
    hosts.length = 0
  })

  const logOf = (host: TransportHost) => host.control<ContractRecord[]>({ type: 'log' })
  const roomsOf = (host: TransportHost) => host.control<Record<string, string[]>>({ type: 'rooms' })
  const statsOf = (host: TransportHost) => host.control<{ clientsCount: number; sockets: number }>({ type: 'stats' })
  const middlewareRunsOf = (host: TransportHost) => host.control<number>({ type: 'middlewareRuns' })

  const recordOf = (host: TransportHost, event: ContractRecord['event'], socketId?: string) =>
    waitFor(async () => {
      const found = (await logOf(host)).find(record => record.event === event && (socketId === undefined || record.socketId === socketId))
      expect(found).toBeDefined()
      return found as ContractRecord
    })

  const expectAllGone = (host: TransportHost) =>
    waitFor(async () => {
      expect(await statsOf(host)).toEqual({ clientsCount: 0, sockets: 0 })
    })

  const disconnection = (client: Socket) => nextEvent<string>(client, 'disconnect')

  const send = (client: Socket, event: string, ...args: unknown[]) => client.timeout(5_000).emitWithAck(event, ...args)

  describe('authentication', () => {
    it('exposes handshake auth and socket data', async () => {
      const host = await start()
      const client = await connectedClient(host, 'valid:alice')

      const identity = await send(client, 'whoami')

      expect(identity.id).toBe(client.id)
      expect(identity.auth).toEqual({ token: 'valid:alice' })
      expect(identity.data).toEqual({ userId: 'alice' })
    })

    it('refuses a bad token with the error data', async () => {
      const host = await start()
      const client = connect(host, { auth: { token: 'bad' } })

      const error = await nextEvent<Error & { data?: unknown }>(client, 'connect_error')

      expect(error.message).toBe('Not authorized')
      expect(error.data).toEqual({ code: 'invalid_token' })
      expect(client.active).toBe(false)
      expect(await logOf(host)).toEqual([])
    })

    it('refuses a missing token without data', async () => {
      const host = await start()
      const client = connect(host)

      const error = await nextEvent<Error & { data?: unknown }>(client, 'connect_error')

      expect(error.message).toBe('Missing token')
      expect(error.data).toBeUndefined()
      expect(await logOf(host)).toEqual([])
    })
  })

  describe('events and acknowledgements', () => {
    it('acknowledges a client event', async () => {
      const client = await connectedClient(await start())

      expect(await send(client, 'echo', { value: 1 })).toEqual({ value: 1 })
    })

    it('acknowledges a server event', async () => {
      const client = await connectedClient(await start())
      client.on('question', (ack: (answer: string) => void) => ack('answer'))

      expect(await send(client, 'askClient', 'question', 2_000)).toEqual({ answer: 'answer' })
    })

    it('times out an acknowledgement the client does not give', async () => {
      const client = await connectedClient(await start())
      client.on('question', () => undefined)

      expect(await send(client, 'askClient', 'question', 100)).toEqual({ timedOut: true })
    })

    it('passes the gameplay message format through unchanged', async () => {
      const client = await connectedClient(await start())
      const received = nextEvent(client, 'game/update')

      client.emit('message', { type: 'game/update', payload: { cards: [1, 2], nested: { ok: true } } })

      expect(await received).toEqual({ cards: [1, 2], nested: { ok: true } })
    })

    it('keeps a non-ASCII payload', async () => {
      const client = await connectedClient(await start())

      expect(await send(client, 'echo', 'приве́т 🃏')).toBe('приве́т 🃏')
    })

    it('round-trips binary as a Buffer', async () => {
      const client = await connectedClient(await start())

      const [{ isBuffer }, bytes] = await new Promise<[{ isBuffer: boolean }, Buffer]>(resolve =>
        client.emit('binary', Buffer.from([0, 1, 254, 255]), (report: { isBuffer: boolean }, echoed: Buffer) => resolve([report, echoed])),
      )

      expect(isBuffer).toBe(true)
      expect(Buffer.from(bytes)).toEqual(Buffer.from([0, 1, 254, 255]))
    })
  })

  describe('rooms', () => {
    it('reaches members only and stops after leave', async () => {
      const host = await start()
      const member = await connectedClient(host, 'valid:member')
      const outsider = await connectedClient(host, 'valid:outsider')
      const received = collect(member, 'news')
      const leaked = collect(outsider, 'news')
      await send(member, 'join', 'room')

      await host.control({ type: 'emitToRoom', room: 'room', event: 'news', payload: 1 })
      await waitFor(async () => expect(received).toEqual([1]))

      await send(member, 'leave', 'room')
      await host.control({ type: 'emitToRoom', room: 'room', event: 'news', payload: 2 })
      await host.control({ type: 'emitToAll', event: 'news', payload: 3 })
      await waitFor(async () => expect(received).toEqual([1, 3]))

      expect(leaked).toEqual([3])
    })

    it('keeps two rooms isolated', async () => {
      const host = await start()
      const first = await connectedClient(host, 'valid:first')
      const second = await connectedClient(host, 'valid:second')
      const firstReceived = collect(first, 'news')
      const secondReceived = collect(second, 'news')
      await send(first, 'join', 'first')
      await send(second, 'join', 'second')

      await host.control({ type: 'emitToRoom', room: 'first', event: 'news', payload: 'first' })
      await host.control({ type: 'emitToRoom', room: 'second', event: 'news', payload: 'second' })

      await waitFor(async () => {
        expect(firstReceived).toEqual(['first'])
        expect(secondReceived).toEqual(['second'])
      })
    })

    it('excludes the sender from socket.to(room) and socket.broadcast', async () => {
      const host = await start()
      const sender = await connectedClient(host, 'valid:sender')
      const peer = await connectedClient(host, 'valid:peer')
      const senderReceived = collect(sender, 'news')
      const peerReceived = collect(peer, 'news')
      await send(sender, 'join', 'room')
      await send(peer, 'join', 'room')

      await send(sender, 'toRoom', 'room', 'news', 'room')
      await send(sender, 'broadcast', 'news', 'everyone')
      await waitFor(async () => expect(peerReceived).toEqual(['room', 'everyone']))
      await send(sender, 'echo', 'flush')

      expect(senderReceived).toEqual([])
    })

    it('reaches everyone through io.emit', async () => {
      const host = await start()
      const first = await connectedClient(host, 'valid:first')
      const second = await connectedClient(host, 'valid:second')
      const received = Promise.all([nextEvent(first, 'news'), nextEvent(second, 'news')])

      await host.control({ type: 'emitToAll', event: 'news', payload: 1 })

      expect(await received).toEqual([1, 1])
    })

    it('empties a room on disconnect', async () => {
      const host = await start()
      const client = await connectedClient(host)
      await send(client, 'join', 'room')
      expect((await roomsOf(host)).room).toEqual([client.id])

      client.disconnect()

      await waitFor(async () => expect((await roomsOf(host)).room).toBeUndefined())
    })
  })

  describe('disconnect', () => {
    it('reports a client disconnect', async () => {
      const host = await start()
      const client = await connectedClient(host)
      const socketId = client.id
      const clientReason = disconnection(client)

      client.disconnect()

      expect(await clientReason).toBe('io client disconnect')
      expect((await recordOf(host, 'disconnect', socketId)).reason).toBe('client namespace disconnect')
    })

    it('reports a client engine close', async () => {
      const host = await start()
      const client = await connectedClient(host)
      const socketId = client.id
      const clientReason = disconnection(client)

      client.io.engine.close()

      expect(await clientReason).toBe('forced close')
      expect((await recordOf(host, 'disconnect', socketId)).reason).toBe('transport close')
    })

    it('reports a server disconnect', async () => {
      const host = await start()
      const client = await connectedClient(host)
      const socketId = client.id as string
      const clientReason = disconnection(client)

      await host.control({ type: 'disconnectSocket', socketId, close: true })

      expect(await clientReason).toBe('io server disconnect')
      expect((await recordOf(host, 'disconnect', socketId)).reason).toBe('server namespace disconnect')
    })

    it('reports a server shutdown', async () => {
      const host = await start()
      const client = await connectedClient(host)
      const socketId = client.id
      const clientReason = disconnection(client)

      await host.control({ type: 'shutdown' })

      expect(await clientReason).toBe('transport close')
      expect((await recordOf(host, 'disconnect', socketId)).reason).toBe('server shutting down')
      await expectAllGone(host)
    })

    it('refuses new connections after a shutdown', async () => {
      const host = await start()
      await connectedClient(host)
      await host.control({ type: 'shutdown' })

      const client = connect(host, { auth: { token: 'valid:user' } })
      await nextEvent(client, 'connect_error')

      expect(client.connected).toBe(false)
      expect((await logOf(host)).filter(({ event }) => event === 'connection')).toHaveLength(1)
      expect(await statsOf(host)).toEqual({ clientsCount: 0, sockets: 0 })
    })

    it('emits disconnecting before disconnect, with the rooms still present', async () => {
      const host = await start()
      const client = await connectedClient(host)
      const socketId = client.id as string
      await send(client, 'join', 'room')

      client.disconnect()

      await recordOf(host, 'disconnect', socketId)
      const records = (await logOf(host)).filter(({ socketId: id }) => id === socketId)
      expect(records.map(({ event }) => event)).toEqual(['connection', 'disconnecting', 'disconnect'])
      expect(records[1]?.rooms).toContain('room')
    })
  })

  describe('multiple tabs', () => {
    it('keeps connections of one user independent', async () => {
      const host = await start()
      const firstTab = await connectedClient(host, 'valid:alice')
      const secondTab = await connectedClient(host, 'valid:alice')
      const firstTabId = firstTab.id
      const secondTabId = secondTab.id
      expect(firstTabId).not.toBe(secondTabId)
      expect(await statsOf(host)).toEqual({ clientsCount: 2, sockets: 2 })

      firstTab.disconnect()
      await recordOf(host, 'disconnect', firstTabId)
      const received = nextEvent(secondTab, 'news')
      await host.control({ type: 'emitToAll', event: 'news', payload: 1 })

      expect(await received).toBe(1)
      expect(secondTab.connected).toBe(true)
      const disconnects = (await logOf(host)).filter(({ event }) => event === 'disconnect' || event === 'disconnecting')
      expect(disconnects.map(({ socketId }) => socketId)).toEqual([firstTabId, firstTabId])
    })
  })

  describe('heartbeat', () => {
    it('keeps a client up across several pings', async () => {
      const host = await start(SHORT_HEARTBEAT)
      const client = await connectedClient(host)
      let pings = 0
      client.io.on('ping', () => pings++)

      await waitFor(async () => expect(pings).toBeGreaterThanOrEqual(3))

      expect(client.connected).toBe(true)
      expect(await send(client, 'echo', 'alive')).toBe('alive')
    })

    it('drops a raw connection that never answers a ping', async () => {
      const host = await start(SHORT_HEARTBEAT)
      const connection = await rawSocket(host)

      await connection.closed

      expect((await recordOf(host, 'disconnect')).reason).toBe('ping timeout')
    })

    it('gives a client that stops seeing pings a ping timeout', async () => {
      const host = await start(SHORT_HEARTBEAT)
      const client = await connectedClient(host)
      const clientReason = disconnection(client)

      dropPings(client)

      expect(await clientReason).toBe('ping timeout')
    })
  })

  describe('reconnection', () => {
    it('reconnects as a new socket after a lost transport', async () => {
      const host = await start()
      const client = await connectedClient(host, 'valid:user', { reconnection: true, reconnectionDelay: 10, reconnectionDelayMax: 10 })
      const firstId = client.id as string
      const clientReason = disconnection(client)
      const reconnected = new Promise(resolve => client.io.once('reconnect', resolve))

      await host.control({ type: 'closeTransport', socketId: firstId })
      expect(await clientReason).toBe('transport close')
      await reconnected
      await waitFor(async () => expect(client.connected).toBe(true))

      expect((await recordOf(host, 'disconnect', firstId)).reason).toBe('forced close')
      expect(client.id).not.toBe(firstId)
      expect(await send(client, 'echo', 'back')).toBe('back')
      expect(await statsOf(host)).toEqual({ clientsCount: 1, sockets: 1 })
    })
  })

  describe('connection state recovery', () => {
    /** A connected client in `room` that has seen one event: a client sends an offset only once it has. */
    const recoverableClient = async (host: TransportHost, token = 'valid:user') => {
      const client = await connectedClient(host, token)
      const seen = nextEvent(client, 'seen')
      await send(client, 'join', 'room')
      await send(client, 'remember', 'kept')
      await host.control({ type: 'emitToAll', event: 'seen', payload: 0 })
      await seen
      return client
    }

    /** Loses the transport, and returns once the server has seen it go, so that what is emitted next falls in the gap. */
    const loseTransport = async (host: TransportHost, client: Socket) => {
      const socketId = client.id as string
      client.io.engine.close()
      await recordOf(host, 'disconnect', socketId)
      return socketId
    }

    const reconnect = async (client: Socket) => {
      const reconnected = connected(client)
      client.connect()
      await reconnected
    }

    const missEvents = async (host: TransportHost) => {
      await host.control({ type: 'emitToRoom', room: 'room', event: 'missed', payload: 1 })
      await host.control({ type: 'emitToAll', event: 'missed', payload: 2 })
      await host.control({ type: 'emitToRoom', room: 'elsewhere', event: 'missed', payload: 'not for this client' })
    }

    it('restores identity, data and rooms and replays missed events once, in order', async () => {
      const host = await start({ connectionStateRecovery: RECOVERY })
      const client = await recoverableClient(host)
      const missed = collect(client, 'missed')
      const socketId = await loseTransport(host, client)
      await missEvents(host)

      await reconnect(client)

      expect(client.recovered).toBe(true)
      expect(client.id).toBe(socketId)
      const identity = await send(client, 'whoami')
      expect(identity.recovered).toBe(true)
      expect(identity.data).toEqual({ userId: 'user', remembered: 'kept' })
      expect(identity.rooms).toContain('room')
      await waitFor(async () => expect(missed).toEqual([1, 2]))
      expect(await middlewareRunsOf(host)).toBe(2)
    })

    it('starts a new session past the window', async () => {
      const host = await start({ connectionStateRecovery: { ...RECOVERY, maxDisconnectionDuration: 100 } })
      const client = await recoverableClient(host)
      const socketId = await loseTransport(host, client)
      await new Promise(resolve => setTimeout(resolve, 300))

      await reconnect(client)

      expect(client.recovered).toBe(false)
      expect(client.id).not.toBe(socketId)
      expect((await send(client, 'whoami')).recovered).toBe(false)
    })

    it('does not recover after an explicit disconnect', async () => {
      const host = await start({ connectionStateRecovery: RECOVERY })
      const client = await recoverableClient(host)
      const socketId = client.id as string

      client.disconnect()
      await recordOf(host, 'disconnect', socketId)
      await reconnect(client)

      expect(client.recovered).toBe(false)
      expect(client.id).not.toBe(socketId)
    })

    it('skips middleware with skipMiddlewares: true', async () => {
      const host = await start({ connectionStateRecovery: { ...RECOVERY, skipMiddlewares: true } })
      const client = await recoverableClient(host)
      await loseTransport(host, client)

      await reconnect(client)

      expect(client.recovered).toBe(true)
      expect((await send(client, 'whoami')).data).toEqual({ userId: 'user', remembered: 'kept' })
      expect(await middlewareRunsOf(host)).toBe(1)
    })

    it('recovers with automatic reconnection', async () => {
      const host = await start({ connectionStateRecovery: RECOVERY })
      const client = await connectedClient(host, 'valid:user', { reconnection: true, reconnectionDelay: 200, reconnectionDelayMax: 200 })
      const seen = nextEvent(client, 'seen')
      await send(client, 'join', 'room')
      await host.control({ type: 'emitToAll', event: 'seen', payload: 0 })
      await seen
      const socketId = client.id as string
      const missed = collect(client, 'missed')

      await host.control({ type: 'closeTransport', socketId })
      await recordOf(host, 'disconnect', socketId)
      await host.control({ type: 'emitToRoom', room: 'room', event: 'missed', payload: 1 })

      await waitFor(async () => expect(missed).toEqual([1]))
      expect(client.recovered).toBe(true)
      expect(client.id).toBe(socketId)
    })

    // Upstream behaviour, pinned on both engines: reauthorization gates the connection, not the replay. Socket.IO
    // writes missed packets from the `Socket` constructor, before middleware runs.
    it('pins upstream: a refused recovery has missed packets on the wire and no connection', async () => {
      const host = await start({ connectionStateRecovery: RECOVERY })
      const client = await recoverableClient(host, 'valid:revoked')
      const missed = collect(client, 'missed')
      const socketId = await loseTransport(host, client)
      await host.control({ type: 'emitToRoom', room: 'room', event: 'missed', payload: 1 })
      await host.control({ type: 'emitToAll', event: 'missed', payload: 2 })
      await host.control({ type: 'revoke', token: 'valid:revoked' })
      const connectionsBefore = (await logOf(host)).filter(({ event }) => event === 'connection').length
      const runsBefore = await middlewareRunsOf(host)
      const packets = recordPackets(client)

      const refusal = nextEvent<Error & { data?: unknown }>(client, 'connect_error')
      client.connect()
      const error = await refusal

      expect(error.message).toBe('Not authorized')
      expect(error.data).toEqual({ code: 'invalid_token' })
      expect(await middlewareRunsOf(host)).toBe(runsBefore + 1)
      expect(packets.map(({ type }) => type)).toEqual([EVENT_PACKET, EVENT_PACKET, CONNECT_ERROR_PACKET])
      expect(packets.map(({ type }) => type)).not.toContain(CONNECT_PACKET)
      expect(packets.slice(0, 2).map(({ data }) => (data as unknown[]).slice(0, 2))).toEqual([
        ['missed', 1],
        ['missed', 2],
      ])
      expect(packets[2]?.data).toEqual({ message: 'Not authorized', data: { code: 'invalid_token' } })
      expect(missed).toEqual([])
      expect(client.connected).toBe(false)
      expect((await logOf(host)).filter(({ event }) => event === 'connection')).toHaveLength(connectionsBefore)
      await waitFor(async () => expect((await roomsOf(host)).room).toBeUndefined())
      await expectAllGone(host)

      await host.control({ type: 'unrevoke', token: 'valid:revoked' })
      await reconnect(client)

      expect(client.recovered).toBe(true)
      expect(client.id).toBe(socketId)
      const identity = await send(client, 'whoami')
      expect(identity.data).toEqual({ userId: 'revoked', remembered: 'kept' })
      expect(identity.rooms).toContain('room')
      // Compared as a set: a client that buffered the first replay delivers both, an upstream client quirk.
      await waitFor(async () => expect(new Set(missed)).toEqual(new Set([1, 2])))
    })
  })

  describe('protocol', () => {
    it.each([
      ['an unknown packet type', '9', 'parse error'],
      ['an empty frame', '', 'parse error'],
      ['a client ping', '2', 'transport error'],
    ])('closes on %s', async (_name, frame, reason) => {
      const host = await start()
      const connection = await rawSocket(host)

      await connection.sentAndClosed(frame)

      expect((await recordOf(host, 'disconnect')).reason).toBe(reason)
    })

    it('reports Socket.IO garbage as a socket error, then closes', async () => {
      const host = await start()
      const connection = await rawSocket(host)

      await connection.sentAndClosed('4Z')

      expect((await recordOf(host, 'error')).reason).toContain('unknown packet type')
      expect((await recordOf(host, 'disconnect')).reason).toBe('forced close')
    })

    it('ignores close and noop packets', async () => {
      const host = await start()
      const connection = await rawSocket(host)

      connection.socket.send('1')
      connection.socket.send('6')
      connection.socket.send('420["echo","still open"]')

      expect(await connection.frame(value => value === '430["still open"]')).toBeDefined()
      expect(connection.socket.readyState).toBe(WebSocket.OPEN)
    })

    it('accepts a frame of exactly maxHttpBufferSize bytes', async () => {
      const host = await start({ maxHttpBufferSize: 1024 })
      const connection = await rawSocket(host)
      const prefix = '420["echo","'
      const suffix = '"]'
      const payload = 'x'.repeat(1024 - prefix.length - suffix.length)

      connection.socket.send(`${prefix}${payload}${suffix}`)

      expect(await connection.frame(value => value === `430["${payload}"]`)).toBeDefined()
    })

    it('refuses a frame one byte above maxHttpBufferSize', async () => {
      const host = await start({ maxHttpBufferSize: 1024 })
      const connection = await rawSocket(host)

      const { code } = await connection.sentAndClosed(`4${'x'.repeat(1024)}`)

      expect(code).toBe(1009)
      expect((await recordOf(host, 'disconnect')).reason).toBe('transport error')
    })

    it('shows a real client above the limit a transport close', async () => {
      const host = await start({ maxHttpBufferSize: 1024 })
      const client = await connectedClient(host)
      const clientReason = disconnection(client)

      client.emit('echo', 'x'.repeat(2_048))

      expect(await clientReason).toBe('transport close')
    })

    it('closes a connection that sends no CONNECT within connectTimeout', async () => {
      const host = await start({ connectTimeout: 100 })
      const connection = rawConnection(host)
      await connection.open()

      await connection.closed

      await expectAllGone(host)
    })

    it('fails an upgrade of another protocol and records it', async () => {
      const host = await start()
      const connection = rawConnection(host, { protocol: 3 })

      await connection.closed

      expect(connection.frames).toEqual([])
      expect((await recordOf(host, 'connection_error')).code).toBe(5)
    })

    it.each([
      ['an unknown transport', 'GET', '?EIO=4&transport=x', { code: 0, message: 'Transport unknown' }],
      ['a session id', 'GET', '?EIO=4&transport=websocket&sid=abc', { code: 1, message: 'Session ID unknown' }],
      ['another method', 'POST', '?EIO=4&transport=websocket', { code: 2, message: 'Bad handshake method' }],
      ['a request without an upgrade', 'GET', '?EIO=4&transport=websocket', { code: 3, message: 'Bad request' }],
      ['an old protocol without an upgrade', 'GET', '?EIO=3&transport=websocket', { code: 3, message: 'Bad request' }],
    ])('answers %s with a 400', async (_name, method, search, body) => {
      const host = await start()

      const response = await fetch(`${host.url}${host.path}${search}`, { method })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual(body)
      expect((await recordOf(host, 'connection_error')).code).toBe(body.code)
    })
  })

  describe('cleanup', () => {
    it('leaves nothing after every client is gone', async () => {
      const host = await start(SHORT_HEARTBEAT)
      const graceful = await connectedClient(host, 'valid:graceful')
      const abrupt = await connectedClient(host, 'valid:abrupt')
      const raw = await rawSocket(host)

      graceful.disconnect()
      abrupt.io.engine.close()
      raw.socket.close()

      await expectAllGone(host)
    })
  })
})
