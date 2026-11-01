import type { Server } from 'socket.io'

/** How a Socket.IO server gets its connections: the one thing the application knows about a runtime. */
export interface SocketEngine {
  attachTo(io: Server): void
}
