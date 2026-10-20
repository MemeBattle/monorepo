import { DiscoveryError, InvalidTokenError, verifyAccessToken } from '@memebattle/ligretto-auth'
import type { ExtendedError, Socket } from 'socket.io'
import { CAS_AUDIENCE, CAS_ISSUER } from '../config'

/** The stable code of a refusal the auth package names. Anything else is an unexpected failure and carries no code. */
const refusalCodeOf = (e: unknown): string | undefined => (e instanceof InvalidTokenError || e instanceof DiscoveryError ? e.code : undefined)

/**
 * Verify the handshake's CAS access token and add the authenticated account id to socket data.
 *
 * This runs once per connection, which is the only check: a live socket is never re-verified.
 *
 * @param socket
 * @param next
 */
export const authMiddleware = async (socket: Socket, next: (error?: ExtendedError) => void) => {
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
    // The message stays opaque and only the stable code travels, in the `data` Socket.IO sends with a refused
    // handshake: a client needs it to tell "refresh and reconnect" from "sign in again" from "retry later" instead
    // of reconnecting forever with a token that will never be accepted. The reason goes to the log, where an
    // operator can tell a token CAS would not have minted from CAS itself being unreadable.
    console.error('Handshake refused:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    const error: ExtendedError = new Error('Not authorized')
    const code = refusalCodeOf(e)
    if (code !== undefined) {
      error.data = { code }
    }
    next(error)
  }
}
