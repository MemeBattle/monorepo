import type { Socket } from 'socket.io'
import { vi } from 'vitest'

interface SocketMockFields {
  id?: string
  data?: { userId?: string }
  handshake?: { auth?: { token?: string } }
}

class _SocketMock {
  public id: string

  public data?: { userId?: string }

  public handshake?: { auth?: { token?: string } }

  constructor({ id = 'socketId', data, handshake }: SocketMockFields = {}) {
    this.id = id
    this.data = data
    this.handshake = handshake
  }

  to = vi.fn().mockReturnThis()

  emit = vi.fn()

  join = vi.fn()

  leave = vi.fn()
}

export const createSocketMockImpl = (fields?: SocketMockFields) => new _SocketMock(fields) as unknown as Socket

/** A promise with its `resolve`, so a test can act while a call that awaits it is pending. */
export const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}
