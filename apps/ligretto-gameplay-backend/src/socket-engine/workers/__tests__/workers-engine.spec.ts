import { Server } from 'socket.io'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkersEngine } from '../workers-engine'
import { engineRequest, FakeSocket } from './fake-socket'

describe('WorkersEngine.openConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retains nothing and announces nothing when the open send throws', async () => {
    const engine = new WorkersEngine({ pingInterval: 1_000, pingTimeout: 500 })
    const onConnection = vi.fn()
    engine.on('connection', onConnection)
    const socket = new FakeSocket()
    socket.failSend = () => true

    const connection = engine.openConnection(socket, engineRequest)
    await Promise.resolve()

    const assertNothingRetained = () => {
      expect(engine.clientsCount).toBe(0)
      expect(engine.clients).toEqual({})
      expect(onConnection).not.toHaveBeenCalled()
      expect(connection.readyState).toBe('closed')
      expect(socket.closes).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
    }
    assertNothingRetained()
    vi.advanceTimersByTime(1_500)
    assertNothingRetained()
  })
})

describe('WorkersEngine with a Socket.IO server', () => {
  it('releases the socket and balances connection with disconnect when the CONNECT send throws', async () => {
    const io = new Server({ serveClient: false })
    const engine = new WorkersEngine()
    engine.attachTo(io)
    const events: string[] = []
    io.on('connection', socket => {
      events.push('connection')
      void socket.join('room')
      socket.on('disconnect', reason => events.push(`disconnect: ${reason}`))
    })
    const socket = new FakeSocket()
    socket.failSend = message => typeof message === 'string' && message.startsWith('40')

    engine.openConnection(socket, engineRequest)
    socket.receive('40')

    await vi.waitFor(() => expect(events).toEqual(['connection', 'disconnect: transport error']))
    expect(io.sockets.sockets.size).toBe(0)
    expect(io.sockets.adapter.rooms.size).toBe(0)
    expect(engine.clientsCount).toBe(0)
    await io.close()
  })
})
