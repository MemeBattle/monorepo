import type { Socket } from 'socket.io'
import { IOC } from '../inversify.config'
import { IOC_TYPES } from '../IOC_TYPES'
import type { AuthService } from '../entities/auth'

/**
 * Add userId to socket.data.user.id
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
  const parsedTokenData = await authService.verifyTokenService(socket.handshake?.auth?.token)
  if (!parsedTokenData) {
    const error = new Error('Not authorized')
    return next(error)
  }
  socket.data.user = { id: parsedTokenData.userId }
  next()
}
