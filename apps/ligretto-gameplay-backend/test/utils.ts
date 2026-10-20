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
