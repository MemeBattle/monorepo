import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { UserRepository } from './user.repo'
import type { User } from '../../types/user'

@injectable()
export class UserService {
  @inject(IOC_TYPES.UserRepository) private userRepository: UserRepository

  addUser(userId: User['socketId']) {
    return this.userRepository.addUser({ socketId: userId })
  }

  removeUser(userId: User['socketId']) {
    return this.userRepository.removeUser(userId)
  }

  getUser(userId: User['socketId']) {
    return this.userRepository.getUser(userId)
  }

  enterGame(userId, gameId) {
    return this.userRepository.updateUser({ socketId: userId, currentGameId: gameId })
  }
}
