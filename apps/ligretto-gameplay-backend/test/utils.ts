import type { Socket } from 'socket.io'
import { vi } from 'vitest'

class _SocketMock {
  public id: string

  public data?: { user?: { id: string } }

  constructor({ id = 'socketId', data }: { id?: string; data?: { user?: { id: string } } } = {}) {
    this.id = id
    this.data = data
  }

  to = vi.fn().mockReturnThis()

  emit = vi.fn()

  join = vi.fn()

  leave = vi.fn()
}

export const createSocketMockImpl = (fields?: { id?: string; data?: { user?: { id: string } } }) => new _SocketMock(fields) as unknown as Socket
