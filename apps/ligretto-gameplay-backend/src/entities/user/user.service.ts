import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { UserRepository } from './user.repo'
import type { User } from '../../types/user'
import type { UUID } from '@memebattle/ligretto-shared'

@injectable()
export class UserService {
  @inject(IOC_TYPES.UserRepository) private userRepository: UserRepository

  connectUser(payload: { userId: UUID; socketId: UUID }) {
    return this.userRepository.createOrUpdate(payload)
  }

  joinGame({ userId, gameId }: { userId: UUID; gameId: UUID }) {
    return this.userRepository.updateUser({ id: userId, currentGameId: gameId })
  }

  async disconnectionHandler({ socketId, userId }: { socketId: string; userId: User['id'] }) {
    const user = await this.getUser(userId)

    if (!user) {
      return
    }

    if (user.socketIds.length > 1) {
      return this.userRepository.updateUser({ id: userId, socketIds: user.socketIds.filter(currentSocketId => currentSocketId !== socketId) })
    }

    return this.userRepository.removeUser(userId)
  }

  getUser(userId: User['id']) {
    return this.userRepository.getUser(userId)
  }
}
