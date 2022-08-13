import type { Socket } from 'socket.io'

class _SocketMock {
  public id: string
  constructor({ id = 'socketId' }: { id?: string } = {}) {
    this.id = id
  }

  to = jest.fn().mockReturnThis()

  emit = jest.fn()

  join = jest.fn()

  leave = jest.fn()
}

export const createSocketMockImpl = (fields?: { id?: string }) => new _SocketMock(fields) as unknown as Socket
