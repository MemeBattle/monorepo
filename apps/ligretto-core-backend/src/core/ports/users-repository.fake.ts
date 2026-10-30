import type { UserProfile, UsersRepository } from './users-repository.ts'

export type FakeUsersRepository = UsersRepository & {
  /** Adds or replaces a profile, as a grant would. */
  set(profile: UserProfile): void
  has(sub: string): boolean
}

export const createFakeUsersRepository = (seed: UserProfile[] = []): FakeUsersRepository => {
  const profiles = new Map(seed.map(profile => [profile.sub, profile]))
  return {
    set: profile => {
      profiles.set(profile.sub, profile)
    },
    has: sub => profiles.has(sub),
    findBySubs: async subs => [...new Set(subs)].flatMap(sub => profiles.get(sub) ?? []),
  }
}
