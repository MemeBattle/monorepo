import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../../test/support/pglite'
import { seedUsers } from '../../../test/support/seed'
import type { UserProfile } from '../../core/ports/users-repository'
import { createPgUsersRepository, upsertUser } from './users-repository'

const alice: UserProfile = { sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: 'https://cdn.test/alice.png' }
const bob: UserProfile = { sub: 'bob', accountType: 'guest', displayName: null, avatarUrl: null }

describe('the Kysely UsersRepository', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.close()
  })

  beforeEach(async () => {
    await database.db.deleteFrom('users').execute()
  })

  it('answers the profiles of known subjects and omits unknown ones', async () => {
    await seedUsers(database.db, [alice, bob])
    const found = await createPgUsersRepository(database.db).findBySubs(['bob', 'nobody', 'alice'])
    expect(found).toHaveLength(2)
    expect(found).toEqual(expect.arrayContaining([alice, bob]))
  })

  it('answers [] for an empty input', async () => {
    await seedUsers(database.db, [alice])
    expect(await createPgUsersRepository(database.db).findBySubs([])).toEqual([])
  })

  it('updates the snapshot of an existing subject in place and keeps created_at', async () => {
    const first = new Date('2026-10-01T00:00:00Z')
    const second = new Date('2026-10-02T00:00:00Z')
    await upsertUser(database.db, alice, first)
    await upsertUser(database.db, { sub: 'alice', accountType: 'guest', displayName: 'A.', avatarUrl: null }, second)

    const rows = await database.db.selectFrom('users').selectAll().execute()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cas_id: 'alice', account_type: 'guest', display_name: 'A.', avatar_url: null })
    expect(rows[0]?.created_at).toEqual(first)
    expect(rows[0]?.updated_at).toEqual(second)
  })

  it('rejects an account type outside the CHECK constraint', async () => {
    const profile = { ...alice, accountType: 'admin' } as unknown as UserProfile
    await expect(upsertUser(database.db, profile, new Date())).rejects.toThrow()
  })
})
