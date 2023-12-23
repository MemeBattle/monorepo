import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { IUserRepository } from './user.repo'
import type { User } from '../../types/user'
import type { UUID } from '@memebattle/ligretto-shared'
import type { Storage } from '../../database/storage'

export interface IUserService {
  connectUser: (payload: { userId: UUID; socketId: UUID }) => Promise<Storage>
  joinGame: ({ userId, gameId }: { userId: UUID; gameId: UUID }) => Promise<void>
  disconnectionHandler: (payload: { userId: User['id']; socketId: UUID }) => Promise<void | Pick<Record<string, User | undefined>, never>>
  getUser: (userId: User['id']) => Promise<User | undefined>
}
@injectable()
export class UserService implements IUserService {
  @inject(IOC_TYPES.IUserRepository) private userRepository: IUserRepository

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
