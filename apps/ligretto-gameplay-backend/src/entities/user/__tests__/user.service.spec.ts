import { beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../../database'
import { IOC_TYPES } from '../../../IOC_TYPES'
import { createIOC } from '../../../inversify.config'
import type { UserService } from '../user.service'

describe('UserService connection identity', () => {
  let database: Database
  let service: UserService

  beforeEach(() => {
    const container = createIOC()
    database = container.get(IOC_TYPES.Database)
    service = container.get(IOC_TYPES.UserService)
  })

  it('removes only the disconnected socket and retains the stable game association', async () => {
    await service.connectUser({ userId: 'user', socketId: 'one' })
    await service.connectUser({ userId: 'user', socketId: 'two' })
    await service.joinGame({ userId: 'user', gameId: 'game' })

    const remaining = await service.disconnectionHandler({ userId: 'user', socketId: 'one' })

    expect(remaining?.socketIds).toEqual(['two'])
    expect(remaining?.currentGameId).toBe('game')
    expect(await database.get(storage => storage.users.user)).toEqual(remaining)
  })

  it('retains an offline user record after their last socket disconnects', async () => {
    await service.connectUser({ userId: 'user', socketId: 'one' })
    await service.joinGame({ userId: 'user', gameId: 'game' })

    const offline = await service.disconnectionHandler({ userId: 'user', socketId: 'one' })

    expect(offline).toMatchObject({ id: 'user', socketIds: [], currentGameId: 'game' })
    expect(await service.hasLiveSockets('user')).toBe(false)
  })
})
