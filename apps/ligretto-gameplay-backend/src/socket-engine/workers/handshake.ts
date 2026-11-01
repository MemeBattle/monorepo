/** The part of Node's `IncomingMessage` that Socket.IO and `socket.request` read. */
export interface EngineRequest {
  method: string
  url: string
  headers: Record<string, string>
  _query: Record<string, string>
  connection: { encrypted: boolean; remoteAddress?: string }
}

export interface HandshakeRefusal {
  code: number
  message: string
  context: Record<string, unknown>
}

interface FetchRequest {
  method: string
  url: string
  headers: Iterable<[string, string]>
}

/** The values of `engine.io`'s `Server.errors` and `Server.errorMessages`. */
const REFUSALS = {
  unknownTransport: { code: 0, message: 'Transport unknown' },
  unknownSession: { code: 1, message: 'Session ID unknown' },
  badHandshakeMethod: { code: 2, message: 'Bad handshake method' },
  badRequest: { code: 3, message: 'Bad request' },
  unsupportedProtocol: { code: 5, message: 'Unsupported protocol version' },
}

/** Outside `engine.io`'s codes: its closed HTTP server refuses the connection, so it has no such refusal. */
export const SERVER_CLOSED: HandshakeRefusal = { code: 6, message: 'Server closed', context: {} }

export const toEngineRequest = (request: FetchRequest): EngineRequest => {
  const url = new URL(request.url)
  const headers = Object.fromEntries(request.headers)

  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    _query: Object.fromEntries(url.searchParams),
    connection: { encrypted: url.protocol === 'https:', remoteAddress: headers['cf-connecting-ip'] },
  }
}

export const isWebSocketUpgrade = (request: EngineRequest) => request.headers.upgrade?.toLowerCase() === 'websocket'

/** Refuses in the order `engine.io` checks, so a request that breaks several rules gets the same code on both engines. */
export const verifyHandshake = (request: EngineRequest, isUpgrade: boolean): HandshakeRefusal | undefined => {
  const { transport, sid, EIO: protocol } = request._query

  if (transport !== 'websocket') {
    return { ...REFUSALS.unknownTransport, context: { transport } }
  }
  // Only a polling session can be resumed by `sid`, and this engine has none.
  if (sid) {
    return { ...REFUSALS.unknownSession, context: { sid } }
  }
  if (request.method !== 'GET') {
    return { ...REFUSALS.badHandshakeMethod, context: { method: request.method } }
  }
  if (!isUpgrade) {
    return { ...REFUSALS.badRequest, context: { name: 'TRANSPORT_HANDSHAKE_ERROR' } }
  }
  if (protocol !== '4') {
    return { ...REFUSALS.unsupportedProtocol, context: { protocol } }
  }
  return undefined
}
