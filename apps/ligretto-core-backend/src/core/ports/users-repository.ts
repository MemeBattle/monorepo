/**
 * The account types of a CAS subject. Declared here rather than imported from `@memebattle/ligretto-auth`, which
 * `src/core` does not depend on; the use case that maps a profile to ligretto-auth's `AuthUser` is where the two
 * unions meet the compiler.
 */
export const ACCOUNT_TYPES = ['guest', 'full'] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** The latest profile snapshot of a CAS subject, written on every grant by the session store. */
export interface UserProfile {
  sub: string
  accountType: AccountType
  displayName: string | null
  avatarUrl: string | null
}

/** The public lookup of profiles, for `GET /api/users`. Not for the game transaction: see `LockedGame`. */
export interface UsersRepository {
  /** The profiles of the subjects that have one; unknown subjects are absent. An empty input answers `[]`. */
  findBySubs(subs: readonly string[]): Promise<UserProfile[]>
}
