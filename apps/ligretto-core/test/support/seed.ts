import type { Database } from '../../src/adapters/pg/database'
import { upsertUser } from '../../src/adapters/pg/users-repository'
import type { UserProfile } from '../../src/core/ports/users-repository'

/** Seeds profiles through the service's own snapshot write. */
export const seedUsers = async (db: Database, profiles: UserProfile[]): Promise<void> => {
  for (const profile of profiles) {
    await upsertUser(db, profile, new Date())
  }
}
