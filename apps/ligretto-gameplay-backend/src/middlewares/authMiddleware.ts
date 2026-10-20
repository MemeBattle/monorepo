import { verifyAccessToken } from '@memebattle/ligretto-auth'
import type { Socket } from 'socket.io'
import { CAS_AUDIENCE, CAS_ISSUER } from '../config'

/**
 * Verify the handshake's CAS access token and add the authenticated account id to socket data.
 *
 * This runs once per connection, which is the only check: a live socket is never re-verified.
 *
 * @param socket
 * @param next
 */
export const authMiddleware = async (socket: Socket, next: (error?: Error) => void) => {
  const token = socket.handshake?.auth?.token
  if (!token) {
    const error = new Error('socket.handshake?.auth?.token is null')
    return next(error)
  }
  try {
    // A refused token and unreadable CAS metadata both refuse the handshake: the client retries, and the cached
    // metadata keeps a CAS outage away from sockets that are already connected.
    const claims = await verifyAccessToken(token, { issuer: CAS_ISSUER, audience: CAS_AUDIENCE })
    socket.data.userId = claims.sub
    next()
  } catch (e) {
    // The reason is logged and not sent: the client learns only that it was refused, while an operator can still tell
    // a token CAS would not have minted from CAS itself being unreadable.
    console.error('Handshake refused:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    next(new Error('Not authorized'))
  }
}
