import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { UserRepository } from './user.repo'
import type { User } from '../../types/user'
import type { Game } from '@memebattle/ligretto-shared'

@injectable()
export class UserService {
  @inject(IOC_TYPES.UserRepository) private userRepository: UserRepository

  addUser(user: User) {
    return this.userRepository.addUser(user)
  }

  removeUser(userId: User['id']) {
    return this.userRepository.removeUser(userId)
  }

  getUser(userId: User['id']) {
    return this.userRepository.getUser(userId)
  }

  enterGame(userId: User['id'], gameId: Game['id']) {
    return this.userRepository.updateUser({ id: userId, currentGameId: gameId })
  }
}
