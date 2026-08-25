import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { UserRepository } from './user.repo'
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

  leaveGame(userId: UUID) {
    return this.userRepository.updateUser({ id: userId, currentGameId: undefined })
  }

  async disconnectionHandler({ socketId, userId }: { socketId: string; userId: User['id'] }) {
    const user = await this.getUser(userId)

    if (!user) {
      return
    }

    return this.userRepository.updateUser({ id: userId, socketIds: user.socketIds.filter(currentSocketId => currentSocketId !== socketId) })
  }

  getUser(userId: User['id']) {
    return this.userRepository.getUser(userId)
  }

  async hasLiveSockets(userId: User['id']) {
    return ((await this.getUser(userId))?.socketIds.length ?? 0) > 0
  }

  removeUser(userId: User['id']) {
    return this.userRepository.removeUser(userId)
  }
}
