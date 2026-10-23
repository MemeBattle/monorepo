// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { createMockStore } from '#testing/lib/createMockStore'

import { getMeFailure, getMeRequest, getMeSuccess } from './authActions'
import { isIdentityPendingSelector } from './authSelectors'
import { authInitialState, authReducer } from './authSlice'

const identity = { userId: 'sub-1', accessToken: 'token-1', expiresAt: 1_000, accountType: 'guest' as const }

describe('authSlice', () => {
  it('marks a request in flight and leaves isBootstrapped alone', () => {
    expect(authReducer(authInitialState, getMeRequest())).toEqual({ ...authInitialState, isLoading: true })
    expect(authReducer({ ...authInitialState, isBootstrapped: true }, getMeRequest())).toMatchObject({ isLoading: true, isBootstrapped: true })
  })

  it('writes the identity on success', () => {
    expect(authReducer({ ...authInitialState, isLoading: true }, getMeSuccess(identity))).toEqual({
      ...identity,
      isLoading: false,
      isBootstrapped: true,
    })
  })

  it('clears only isLoading on failure', () => {
    expect(authReducer({ ...authInitialState, isLoading: true }, getMeFailure())).toEqual(authInitialState)
  })

  it('keeps the identity pending until the first success', () => {
    const store = createMockStore()
    expect(isIdentityPendingSelector(store.getState())).toBe(true)

    store.dispatch(getMeRequest())
    store.dispatch(getMeFailure())
    expect(isIdentityPendingSelector(store.getState())).toBe(true)

    store.dispatch(getMeSuccess(identity))
    expect(isIdentityPendingSelector(store.getState())).toBe(false)

    store.dispatch(getMeRequest())
    expect(isIdentityPendingSelector(store.getState())).toBe(false)
  })
})
