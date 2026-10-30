import { describe, expect, it } from 'vitest'

import { addUser, addUsers } from './usersActions'
import { usersReducer } from './usersSlice'

describe('usersSlice', () => {
  it('lets addUser replace a user added earlier', () => {
    const state = usersReducer(undefined, addUsers([{ sub: 'sub-1', accountType: 'full', name: 'Old', avatarUrl: null }]))

    const next = usersReducer(state, addUser({ sub: 'sub-1', accountType: 'full', name: 'New', avatarUrl: null }))

    expect(next.entities['sub-1']).toEqual({ sub: 'sub-1', accountType: 'full', name: 'New', avatarUrl: null })
  })
})
