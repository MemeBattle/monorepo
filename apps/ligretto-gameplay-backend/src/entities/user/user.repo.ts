import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { Database } from '../../database'
import type { User } from '../../types/user'
import { omit } from 'lodash'
import type { UUID } from '@memebattle/ligretto-shared'
import assert = require('node:assert')

@injectable()
export class UserRepository {
  @inject(IOC_TYPES.Database) private database: Database

  createOrUpdate({ userId, socketId }: { userId: UUID; socketId: string }) {
    return this.database.set(storage => {
      const user = storage.users[userId] || { id: userId, socketIds: [] }
      user.socketIds.push(socketId)
      storage.users[userId] = user
      return storage
    })
  }

  updateUser(updatePayload: Partial<User> & { id: User['id'] }) {
    return this.database.set(storage => {
      const user = storage.users[updatePayload.id]
      assert(user, 'User not found')
      storage.users[user.id] = { ...user, ...updatePayload }
    })
  }

  removeUser(userId: User['id']) {
    return this.database.set(storage => (storage.users = omit(storage.users, userId)))
  }

  getUser(userId: User['id']) {
    return this.database.get(storage => storage.users[userId])
  }
}
