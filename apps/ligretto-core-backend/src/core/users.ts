import type { UserProfile, UsersRepository } from './ports/users-repository.ts'

/**
 * The profile lookup of `GET /api/users` (docs/DESIGN.md § Routes): the latest snapshot of each subject that has one.
 * Each id is looked up once, whatever the repeats; the order of the answer is not promised and unknown ids are absent.
 * The mapping to `AuthUser` of `@memebattle/ligretto-auth` is `src/http`'s, since `src/core` does not depend on it.
 */
export const createListUsers =
  ({ users }: { users: UsersRepository }) =>
  async (subs: readonly string[]): Promise<UserProfile[]> => {
    const distinct = [...new Set(subs)]
    return distinct.length === 0 ? [] : await users.findBySubs(distinct)
  }
