import type { Storage } from '../../database/storage'

import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../../IOC_TYPES'
import { Database } from '../../database'
import type { User } from '../../types/user'
import { omit } from 'lodash'
import type { UUID } from '@memebattle/ligretto-shared'
import assert from 'node:assert'

export interface IUserRepository {
  createOrUpdate({ userId, socketId }: { userId: UUID; socketId: string }): Promise<Storage>
  updateUser(updatePayload: Partial<User> & { id: User['id'] }): Promise<void>
  removeUser(userId: User['id']): Promise<Pick<Record<string, User | undefined>, never>>
  getUser(userId: User['id']): Promise<User | undefined>
}

@injectable()
export class UserRepository implements IUserRepository {
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
