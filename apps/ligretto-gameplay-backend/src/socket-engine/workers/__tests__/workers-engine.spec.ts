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

  it('retains nothing and announces nothing when the open send throws', () => {
    const engine = new WorkersEngine({ pingInterval: 1_000, pingTimeout: 500 })
    const onConnection = vi.fn()
    engine.on('connection', onConnection)
    const socket = new FakeSocket()
    socket.failSend = () => true

    const connection = engine.openConnection(socket, engineRequest)

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
