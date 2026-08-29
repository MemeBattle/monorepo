import type { Socket } from 'socket.io'
import { IOC } from '../inversify.config'
import { IOC_TYPES } from '../IOC_TYPES'
import type { AuthService } from '../services/auth'

/**
 * Add the stable authenticated user id to socket data.
 *
 * @param socket
 * @param next
 */
export const authMiddleware = async (socket: Socket, next: (error?: Error) => void) => {
  const authService = IOC.get<AuthService>(IOC_TYPES.AuthService)
  const token = socket.handshake?.auth?.token
  if (!token) {
    const error = new Error('socket.handshake?.auth?.token is null')
    return next(error)
  }
  const parsedTokenData = await authService.verifyTokenService(token)
  if (!parsedTokenData) {
    const error = new Error('Not authorized')
    return next(error)
  }
  socket.data.userId = parsedTokenData.userId
  next()
}
