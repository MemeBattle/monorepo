import { describe, expect, it } from 'vitest'

import type { UserProfile, UsersRepository } from './ports/users-repository.ts'
import { createFakeUsersRepository } from './ports/users-repository.fake.ts'
import { createListUsers } from './users.ts'

const ALICE: UserProfile = { sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: 'https://avatars.example/alice' }
const GUEST: UserProfile = { sub: 'guest', accountType: 'guest', displayName: null, avatarUrl: null }

/** The fake repository, recording what each lookup was asked for. */
const spying = (): { users: UsersRepository; calls: string[][] } => {
  const fake = createFakeUsersRepository([ALICE, GUEST])
  const calls: string[][] = []
  return {
    calls,
    users: {
      findBySubs: async subs => {
        calls.push([...subs])
        return await fake.findBySubs(subs)
      },
    },
  }
}

describe('listUsers', () => {
  it('answers the profile of every known id', async () => {
    const { users } = spying()
    expect(await createListUsers({ users })(['alice', 'guest'])).toEqual(expect.arrayContaining([ALICE, GUEST]))
  })

  it('leaves an unknown id out', async () => {
    const { users } = spying()
    expect(await createListUsers({ users })(['alice', 'never-seen'])).toEqual([ALICE])
  })

  it('looks each id up once, whatever the repeats', async () => {
    const { users, calls } = spying()
    expect(await createListUsers({ users })(['alice', 'alice', 'guest', 'alice'])).toHaveLength(2)
    expect(calls).toEqual([['alice', 'guest']])
  })

  it('answers [] for no ids without asking the repository', async () => {
    const { users, calls } = spying()
    expect(await createListUsers({ users })([])).toEqual([])
    expect(calls).toEqual([])
  })
})
