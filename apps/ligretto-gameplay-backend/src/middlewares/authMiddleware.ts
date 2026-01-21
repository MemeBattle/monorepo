import type { Socket } from 'socket.io'
import { IOC } from '../inversify.config'
import { IOC_TYPES } from '../IOC_TYPES'
import type { IAuthService } from '../services/auth'

/**
 * Add userId to socket.data.user.id
 *
 * @param socket
 * @param next
 */
export const authMiddleware = async (socket: Socket, next: (error?: Error) => void) => {
  const authService = IOC.get<IAuthService>(IOC_TYPES.IAuthService)
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
  socket.data.user = { id: parsedTokenData.userId }
  next()
}
