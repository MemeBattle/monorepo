import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { decodePacket, encodePacket } from 'engine.io-parser'
import type { PacketType, RawData } from 'engine.io-parser'
import type { EngineRequest } from './handshake'

type MessageListener = (event: { data: string | ArrayBuffer }) => void

/** The calls a connection makes on a server-side WebSocket. */
export interface ConnectionSocket {
  send(message: string | ArrayBuffer | ArrayBufferView): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'message', listener: MessageListener): void
  addEventListener(type: 'close' | 'error', listener: () => void): void
  removeEventListener(type: 'message', listener: MessageListener): void
  removeEventListener(type: 'close' | 'error', listener: () => void): void
}

export interface ConnectionOptions {
  pingInterval: number
  pingTimeout: number
  maxHttpBufferSize: number
}

type ReadyState = 'opening' | 'open' | 'closing' | 'closed'

const MESSAGE_TOO_BIG = 1009
const MESSAGE_TOO_BIG_REASON = 'Max payload size exceeded'

const byteLengthOf = (frame: string | ArrayBuffer) => (typeof frame === 'string' ? new TextEncoder().encode(frame).byteLength : frame.byteLength)

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)))

/**
 * Engine.IO protocol 4 over one WebSocket: the part of `engine.io`'s `Socket` that Socket.IO reads as `conn`.
 *
 * It differs from `engine.io` in one way. `send` of a workerd WebSocket throws synchronously where `engine.io`'s
 * transport reports a failure later, so any send can close the connection on the spot, and nothing after a send may
 * assume it is still open.
 */
export class WorkersConnection extends EventEmitter {
  readonly protocol = 4
  readonly remoteAddress?: string
  readonly transport: { readonly name: 'websocket'; readonly writable: boolean }
  readyState: ReadyState = 'opening'

  private pingIntervalTimer?: ReturnType<typeof setTimeout>
  private pingTimeoutTimer?: ReturnType<typeof setTimeout>

  constructor(
    readonly id: string,
    private readonly socket: ConnectionSocket,
    readonly request: EngineRequest,
    private readonly options: ConnectionOptions,
  ) {
    super()
    this.remoteAddress = request.connection.remoteAddress
    const isOpen = () => this.readyState === 'open'
    this.transport = {
      name: 'websocket',
      get writable() {
        return isOpen()
      },
    }
  }

  /** Apart from the constructor, so that the owner subscribes to `close` before a failed send can emit it. */
  start() {
    this.readyState = 'open'
    this.socket.addEventListener('message', this.onSocketMessage)
    this.socket.addEventListener('close', this.onSocketClose)
    this.socket.addEventListener('error', this.onSocketError)

    const { pingInterval, pingTimeout, maxHttpBufferSize } = this.options
    this.sendPacket('open', JSON.stringify({ sid: this.id, upgrades: [], pingInterval, pingTimeout, maxPayload: maxHttpBufferSize }))
    this.schedulePing()
  }

  write(data: RawData, _options?: unknown) {
    this.sendPacket('message', data)
    return this
  }

  send(data: RawData, _options?: unknown) {
    return this.write(data)
  }

  close(_discard?: boolean) {
    if (this.readyState !== 'open') {
      return
    }
    this.readyState = 'closing'
    this.onClose('forced close')
  }

  private readonly onSocketClose = () => this.onClose('transport close')

  private readonly onSocketError = () => this.onClose('transport error', new Error('WebSocket error'))

  private readonly onSocketMessage: MessageListener = ({ data: frame }) => {
    if (this.readyState !== 'open') {
      return
    }
    if (byteLengthOf(frame) > this.options.maxHttpBufferSize) {
      this.closeSocket(MESSAGE_TOO_BIG, MESSAGE_TOO_BIG_REASON)
      this.onClose('transport error', new RangeError(MESSAGE_TOO_BIG_REASON))
      return
    }

    const packet = decodePacket(frame, 'arraybuffer')
    this.emit('packet', packet)

    switch (packet.type) {
      case 'ping':
        this.onClose('transport error', new Error('invalid heartbeat direction'))
        break
      case 'pong':
        clearTimeout(this.pingTimeoutTimer)
        this.schedulePing()
        this.emit('heartbeat')
        break
      case 'error':
        this.onClose('parse error')
        break
      case 'message': {
        const data = packet.data instanceof ArrayBuffer ? Buffer.from(packet.data) : packet.data
        this.emit('data', data)
        this.emit('message', data)
        break
      }
    }
  }

  private schedulePing() {
    if (this.readyState !== 'open') {
      return
    }
    clearTimeout(this.pingIntervalTimer)
    this.pingIntervalTimer = setTimeout(() => {
      this.sendPacket('ping')
      this.resetPingTimeout()
    }, this.options.pingInterval)
  }

  private resetPingTimeout() {
    if (this.readyState !== 'open') {
      return
    }
    clearTimeout(this.pingTimeoutTimer)
    this.pingTimeoutTimer = setTimeout(() => this.onClose('ping timeout'), this.options.pingTimeout)
  }

  private sendPacket(type: PacketType, data?: RawData) {
    if (this.readyState !== 'open') {
      return
    }
    encodePacket({ type, data }, true, encoded => {
      try {
        this.socket.send(encoded)
      } catch (error) {
        this.onClose('transport error', toError(error))
      }
    })
  }

  private onClose(reason: string, description?: Error) {
    if (this.readyState === 'closed') {
      return
    }
    this.readyState = 'closed'
    clearTimeout(this.pingIntervalTimer)
    clearTimeout(this.pingTimeoutTimer)
    this.socket.removeEventListener('message', this.onSocketMessage)
    this.socket.removeEventListener('close', this.onSocketClose)
    this.socket.removeEventListener('error', this.onSocketError)
    this.closeSocket()
    this.emit('close', reason, description)
  }

  /** `close` throws after an `error` event or an earlier `close`, and at this point the connection is over either way. */
  private closeSocket(code?: number, reason?: string) {
    try {
      this.socket.close(code, reason)
    } catch {
      // Nothing left to release.
    }
  }
}
