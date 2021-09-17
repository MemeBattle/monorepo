import type { Socket } from 'socket.io'
import { IOC } from '../inversify.config'
import { IOC_TYPES } from '../IOC_TYPES'
import type { AuthService } from '../entities/auth'

/**
 * Add userId to socket.data.userId
 * If user is not authorized userId will be null
 * @param socket
 * @param next
 */
export const authMiddleware = async (socket: Socket, next: () => void) => {
  const authService = IOC.get<AuthService>(IOC_TYPES.AuthService)
  const parsedTokenData = await authService.verifyTokenService(socket.handshake?.auth?.token)
  socket.data.user = parsedTokenData ? { isAuthorized: true, id: parsedTokenData.userId } : { isAuthorized: false, id: socket.id }
  next()
}
