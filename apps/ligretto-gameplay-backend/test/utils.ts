import type { Socket } from 'socket.io'

class _SocketMock {
  public id: string

  public data?: { user?: { id: string } }

  constructor({ id = 'socketId', data }: { id?: string; data?: { user?: { id: string } } } = {}) {
    this.id = id
    this.data = data
  }

  to = jest.fn().mockReturnThis()

  emit = jest.fn()

  join = jest.fn()

  leave = jest.fn()
}

export const createSocketMockImpl = (fields?: { id?: string; data?: { user?: { id: string } } }) => new _SocketMock(fields) as unknown as Socket
