import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkersConnection } from '../workers-connection'
import { engineRequest, FakeSocket } from './fake-socket'

const options = { pingInterval: 1_000, pingTimeout: 500, maxHttpBufferSize: 16 }

const setup = () => {
  const socket = new FakeSocket()
  const connection = new WorkersConnection('connection-id', socket, engineRequest, options)
  const close = vi.fn()
  connection.on('close', close)
  return { socket, connection, close }
}

const started = () => {
  const context = setup()
  context.connection.start()
  return context
}

const expectFullyClosed = (context: ReturnType<typeof setup>, reason: string) => {
  const assertState = () => {
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(context.close).toHaveBeenCalledWith(reason, expect.anything())
    expect(context.socket.listenerCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  }
  assertState()
  vi.advanceTimersByTime(options.pingInterval + options.pingTimeout)
  assertState()
}

describe('WorkersConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing before start()', () => {
    const { socket, connection } = setup()

    expect(connection.readyState).toBe('opening')
    expect(socket.sent).toEqual([])
    expect(socket.listenerCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens with the session parameters and no upgrades', () => {
    const { socket, connection } = started()

    expect(connection.readyState).toBe('open')
    expect(socket.sent).toEqual([`0${JSON.stringify({ sid: 'connection-id', upgrades: [], pingInterval: 1_000, pingTimeout: 500, maxPayload: 16 })}`])
  })

  describe('heartbeat', () => {
    it('pings after pingInterval', () => {
      const { socket } = started()

      vi.advanceTimersByTime(999)
      expect(socket.sent).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(socket.sent.at(-1)).toBe('2')
    })

    it('closes with ping timeout when no pong arrives within pingTimeout', () => {
      const { close } = started()

      vi.advanceTimersByTime(1_499)
      expect(close).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(close).toHaveBeenCalledWith('ping timeout', undefined)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('re-arms the ping when a pong arrives', () => {
      const { socket, close, connection } = started()
      const heartbeat = vi.fn()
      connection.on('heartbeat', heartbeat)

      vi.advanceTimersByTime(1_000)
      socket.receive('3')
      vi.advanceTimersByTime(999)
      expect(socket.sent).toHaveLength(2)
      vi.advanceTimersByTime(1)

      expect(socket.sent).toHaveLength(3)
      expect(heartbeat).toHaveBeenCalledTimes(1)
      expect(close).not.toHaveBeenCalled()
    })

    it('keeps one ping timer when a pong arrives unasked', () => {
      const { socket } = started()

      socket.receive('3')

      expect(vi.getTimerCount()).toBe(1)
    })

    it('leaves no timer when a packet listener closes the connection on a pong', () => {
      const { socket, connection } = started()
      connection.on('packet', () => connection.close())

      vi.advanceTimersByTime(1_000)
      socket.receive('3')

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('incoming frames', () => {
    it('measures text in bytes, at the limit and one byte over', () => {
      const atTheLimit = setup()
      const overTheLimit = setup()
      const data = vi.fn()
      atTheLimit.connection.on('data', data)
      atTheLimit.connection.start()
      overTheLimit.connection.start()

      atTheLimit.socket.receive(`4${'é'.repeat(7)}a`)
      overTheLimit.socket.receive(`4${'é'.repeat(8)}`)

      expect(data).toHaveBeenCalledWith(`${'é'.repeat(7)}a`)
      expect(atTheLimit.close).not.toHaveBeenCalled()
      expect(overTheLimit.socket.closes[0]).toEqual({ code: 1009, reason: 'Max payload size exceeded' })
      expect(overTheLimit.close).toHaveBeenCalledWith('transport error', expect.any(RangeError))
    })

    it('refuses binary above the limit', () => {
      const { socket, close } = started()

      socket.receive(new ArrayBuffer(17))

      expect(socket.closes[0]?.code).toBe(1009)
      expect(close).toHaveBeenCalledWith('transport error', expect.any(RangeError))
    })

    it('hands binary to Socket.IO as a Buffer', () => {
      const { socket, connection } = setup()
      const data = vi.fn()
      connection.on('data', data)
      connection.start()

      socket.receive(new Uint8Array([1, 2, 3]).buffer)

      expect(data).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
    })

    it('ignores a frame after the connection closed', () => {
      const { socket, connection } = setup()
      const data = vi.fn()
      connection.on('data', data)
      connection.start()

      connection.close()
      socket.receive('4late')

      expect(data).not.toHaveBeenCalled()
    })
  })

  describe('closing', () => {
    it.each([
      ['a server close', ({ connection }: ReturnType<typeof setup>) => connection.close(), 'forced close'],
      ['the peer', ({ socket }: ReturnType<typeof setup>) => socket.dispatch('close'), 'transport close'],
      ['a socket error', ({ socket }: ReturnType<typeof setup>) => socket.dispatch('error'), 'transport error'],
      ['an unknown packet', ({ socket }: ReturnType<typeof setup>) => socket.receive('9'), 'parse error'],
      ['a client ping', ({ socket }: ReturnType<typeof setup>) => socket.receive('2'), 'transport error'],
    ])('releases everything after %s', (_name, closeIt, reason) => {
      const context = started()

      closeIt(context)

      expect(context.close).toHaveBeenCalledTimes(1)
      expect(context.close.mock.calls[0]?.[0]).toBe(reason)
      expect(context.socket.listenerCount).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
      expect(context.connection.readyState).toBe('closed')
    })

    it('emits close once when closed twice', () => {
      const { connection, socket, close } = started()

      connection.close()
      connection.close()
      socket.dispatch('close')

      expect(close).toHaveBeenCalledTimes(1)
    })

    it('swallows a socket close that throws', () => {
      const { connection, socket, close } = started()
      socket.failClose = true

      expect(() => connection.close()).not.toThrow()
      expect(close).toHaveBeenCalledWith('forced close', undefined)
    })

    it('drops writes after close', () => {
      const { connection, socket } = started()
      const sentBefore = socket.sent.length

      connection.close()
      connection.write('2["late"]')

      expect(socket.sent).toHaveLength(sentBefore)
      expect(connection.transport.writable).toBe(false)
    })
  })

  describe('send failures', () => {
    it('closes when the open send throws in start()', () => {
      const context = setup()
      context.socket.failSend = () => true

      context.connection.start()

      expectFullyClosed(context, 'transport error')
    })

    it('leaves no ping timeout when the ping send throws', () => {
      const context = started()
      context.socket.failSend = message => message === '2'

      vi.advanceTimersByTime(options.pingInterval)

      expectFullyClosed(context, 'transport error')
    })

    it('closes when a message write throws', () => {
      const context = started()
      context.socket.failSend = () => true

      context.connection.write('2["event"]')

      expectFullyClosed(context, 'transport error')
    })
  })
})
