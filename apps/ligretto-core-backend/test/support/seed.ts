import type { Database } from '../../src/adapters/pg/database.ts'
import { upsertUser } from '../../src/adapters/pg/users-repository.ts'
import type { UserProfile } from '../../src/core/ports/users-repository.ts'

/** Seeds profiles through the service's own snapshot write. */
export const seedUsers = async (db: Database, profiles: UserProfile[]): Promise<void> => {
  for (const profile of profiles) {
    await upsertUser(db, profile, new Date())
  }
}
