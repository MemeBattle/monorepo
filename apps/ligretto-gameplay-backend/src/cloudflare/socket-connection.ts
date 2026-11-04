import type { AnyAction } from '../core/actions'
import type { Connection } from '../core/ports'

const HEARTBEAT_PING = 'ping'
const HEARTBEAT_PONG = 'pong'

/** Answered by the runtime, so a client's heartbeat does not wake a sleeping object. */
export const heartbeatAutoResponse = () => new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG)

/** A send on a socket that is going away throws, and that must not stop the delivery to everybody else. */
export class SocketConnection implements Connection {
  constructor(readonly socket: WebSocket) {}

  send(action: AnyAction) {
    try {
      this.socket.send(JSON.stringify(action))
    } catch (error) {
      console.warn('A send failed', error)
    }
  }

  close(code: number, reason: string) {
    try {
      this.socket.close(code, reason)
    } catch (error) {
      console.warn('A close failed', error)
    }
  }
}

export const isOpen = (socket: WebSocket) => socket.readyState === WebSocket.READY_STATE_OPEN
