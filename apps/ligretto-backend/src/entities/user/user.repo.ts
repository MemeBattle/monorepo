import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { Database } from '../../database'
import type { User } from '../../types/user'
import { omit } from 'lodash'

@injectable()
export class UserRepository {
  @inject(IOC_TYPES.Database) private database: Database

  addUser(user: Partial<User> & { id: User['id'] }) {
    return this.database.set(storage => (storage.users[user.id] = user))
  }

  updateUser(user: Partial<User> & { id: User['id'] }) {
    return this.database.set(storage => (storage.users[user.id] = { ...storage.users[user.id], ...user }))
  }

  removeUser(userId: User['id']) {
    return this.database.set(storage => (storage.users = omit(storage.users, userId)))
  }

  getUser(userId: User['id']) {
    return this.database.get(storage => storage.users[userId])
  }
}
