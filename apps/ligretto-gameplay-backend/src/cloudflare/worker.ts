import { DiscoveryError, InvalidTokenError, verifyAccessToken, type AccessTokenClaims } from '@memebattle/ligretto-auth'
import type { Env } from './env'
import { rejectMissingRoom, refuseSocket } from './refuse-socket'

// The audience CAS registers for the ligretto client: this app's own name, not a deployment choice.
const CAS_AUDIENCE = 'ligretto'
const CAS_REQUEST_TIMEOUT_MS = 5_000

const CLOSE_TOKEN_REFUSED = 4401
const CLOSE_CAS_UNAVAILABLE = 4503

// Under one prefix because production shares ligretto.app with other Workers through routes.
const LOBBY_PATH = '/gameplay/lobby'
const HEALTH_PATH = '/gameplay/health'
const ROOM_PATH = /^\/gameplay\/games\/(.+)$/

// verifyAccessToken sets no timeout of its own, so the bound goes on its fetch, as in ligretto-core-backend.
const boundedFetch: typeof fetch = (input, init) => {
  const deadline = AbortSignal.timeout(CAS_REQUEST_TIMEOUT_MS)
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
}

const routeToDurableObject = async (request: Request, env: Env, userId: string) => {
  const { pathname } = new URL(request.url)
  const headers = new Headers(request.headers)
  // Trusted because only this Worker can reach the objects: it overwrites whatever the client sent.
  headers.set('X-User-Id', userId)

  const lobby = env.LOBBY.get(env.LOBBY.idFromName('global'))

  if (pathname === LOBBY_PATH) {
    return lobby.fetch(new Request(request, { headers }))
  }

  const roomId = ROOM_PATH.exec(pathname)?.[1]
  if (!roomId) {
    return new Response('Not found', { status: 404 })
  }

  const hostId = await lobby.resolveHost(roomId)
  if (!hostId) {
    return rejectMissingRoom()
  }

  headers.set('X-Room-Id', roomId)
  return env.ROOM.get(env.ROOM.idFromName(hostId)).fetch(new Request(request, { headers }))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === HEALTH_PATH) {
      return new Response(null, { status: 200 })
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 })
    }
    // A browser's WebSocket cannot set headers, so the token travels in the query string.
    const token = url.searchParams.get('token')
    if (!token) {
      return refuseSocket(CLOSE_TOKEN_REFUSED)
    }

    // Only the verification is inside: a failure of the objects behind it is not a refused handshake.
    let claims: AccessTokenClaims
    try {
      claims = await verifyAccessToken(token, { issuer: env.CAS_ISSUER, audience: CAS_AUDIENCE, fetch: boundedFetch })
    } catch (error) {
      console.error('Handshake refused:', error instanceof Error ? `${error.name}: ${error.message}` : error)

      if (error instanceof InvalidTokenError) {
        return refuseSocket(CLOSE_TOKEN_REFUSED, error.code)
      }
      if (error instanceof DiscoveryError) {
        return refuseSocket(CLOSE_CAS_UNAVAILABLE, error.code)
      }
      return refuseSocket(CLOSE_CAS_UNAVAILABLE)
    }

    return routeToDurableObject(request, env, claims.sub)
  },
} satisfies ExportedHandler<Env>

export { RoomDO } from './room/room-do'
export { LobbyDO } from './lobby/lobby-do'
