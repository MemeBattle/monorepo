import { describe, expect, it } from 'vitest'

import { addUser, addUsers } from './usersActions'
import { usersReducer } from './usersSlice'

describe('usersSlice', () => {
  it('lets addUser replace a user added earlier', () => {
    const state = usersReducer(undefined, addUsers([{ casId: 'sub-1', accountType: 'full', displayName: 'Old', avatarUrl: null }]))

    const next = usersReducer(state, addUser({ casId: 'sub-1', accountType: 'full', displayName: 'New', avatarUrl: null }))

    expect(next.entities['sub-1']).toEqual({ casId: 'sub-1', accountType: 'full', displayName: 'New', avatarUrl: null })
  })
})
