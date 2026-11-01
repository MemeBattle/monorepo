import type { ConnectionSocket } from '../workers-connection'
import type { EngineRequest } from '../handshake'

type Listener = (event: { data: string | ArrayBuffer }) => void
type Failure = (message: string | ArrayBuffer | ArrayBufferView) => boolean

export const engineRequest: EngineRequest = {
  method: 'GET',
  url: '/socket.io/?EIO=4&transport=websocket',
  headers: {},
  _query: { EIO: '4', transport: 'websocket' },
  connection: { encrypted: true, remoteAddress: '203.0.113.7' },
}

/** A synchronous send failure cannot be provoked on demand in real workerd; everything else runs there in the contract. */
export class FakeSocket implements ConnectionSocket {
  readonly sent: (string | ArrayBuffer | ArrayBufferView)[] = []
  readonly closes: { code?: number; reason?: string }[] = []
  failSend?: Failure
  failClose = false

  private readonly listeners = new Map<string, Set<Listener>>()

  get listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0)
  }

  send(message: string | ArrayBuffer | ArrayBufferView) {
    if (this.failSend?.(message)) {
      throw new Error('send failed')
    }
    this.sent.push(message)
  }

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason })
    if (this.failClose) {
      throw new Error('close failed')
    }
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    this.listeners.set(type, listeners.add(listener))
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  receive(data: string | ArrayBuffer) {
    this.dispatch('message', data)
  }

  dispatch(type: 'message' | 'close' | 'error', data: string | ArrayBuffer = '') {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ data })
    }
  }
}
