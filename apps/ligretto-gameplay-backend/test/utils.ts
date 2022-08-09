import type { Socket } from 'socket.io'

class _SocketMock {
  to = jest.fn().mockReturnThis()

  emit = jest.fn()
}

export const socketMockImpl = new _SocketMock() as unknown as Socket
