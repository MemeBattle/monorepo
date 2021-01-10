import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import type { User } from '../../types/user'
import { omit } from 'lodash'

@injectable()
export class UserRepository {
  @inject(IOC_TYPES.Database) private database: Database

  addUser(user: Partial<User> & { socketId: User['socketId'] }) {
    return this.database.set(storage => (storage.users[user.socketId] = user))
  }

  updateUser(user: Partial<User> & { socketId: User['socketId'] }) {
    return this.database.set(storage => (storage.users[user.socketId] = { ...storage.users[user.socketId], ...user }))
  }

  removeUser(userId: User['socketId']) {
    return this.database.set(storage => (storage.users = omit(storage.users, userId)))
  }

  getUser(userId: User['socketId']) {
    return this.database.get(storage => storage.users[userId])
  }
}
