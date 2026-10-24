import { ACCOUNT_TYPES } from '../../core/ports/users-repository'
import type { AccountType, UserProfile, UsersRepository } from '../../core/ports/users-repository'
import type { Database } from './database'

/** The CHECK constraint on `account_type` makes another value impossible, so one is a bug, not an expected failure. */
const toAccountType = (value: string): AccountType => {
  const accountType = ACCOUNT_TYPES.find(known => known === value)
  if (accountType === undefined) {
    throw new Error(`unexpected account_type ${value}`)
  }
  return accountType
}

export const createPgUsersRepository = (db: Database): UsersRepository => ({
  findBySubs: async subs => {
    if (subs.length === 0) {
      return []
    }
    const rows = await db
      .selectFrom('users')
      .select(['cas_id', 'account_type', 'display_name', 'avatar_url'])
      .where('cas_id', 'in', [...subs])
      .execute()
    return rows.map(row => ({
      sub: row.cas_id,
      accountType: toAccountType(row.account_type),
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }))
  },
})

/**
 * The one write of the latest profile snapshot: inserts the subject's row or updates its snapshot and `updated_at`.
 * Not on the port: the session store's `saveSession` (#836) runs it inside its own transaction, and the test seed
 * goes through it so fixtures use the service's own statement. `at` comes from the caller's clock.
 */
export const upsertUser = async (db: Database, profile: UserProfile, at: Date): Promise<void> => {
  const snapshot = { account_type: profile.accountType, display_name: profile.displayName, avatar_url: profile.avatarUrl }
  await db
    .insertInto('users')
    .values({ cas_id: profile.sub, ...snapshot, created_at: at, updated_at: at })
    .onConflict(oc => oc.column('cas_id').doUpdateSet({ ...snapshot, updated_at: at }))
    .execute()
}
