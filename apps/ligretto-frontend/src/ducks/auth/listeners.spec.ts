// @vitest-environment jsdom

import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rootReducer } from '#app/store/rootReducer'
import { LIGRETTO_CORE_URL } from '#shared/constants/config'
import type { All } from '#types/store'

import { getMeRequest } from './authActions'
import { addListeners } from './listeners'

vi.mock('#entities/analytics', () => ({ analytics: { setUserProperties: vi.fn(), logEvent: vi.fn() } }))
vi.mock('@sentry/browser', () => ({ setUser: vi.fn() }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let listener: ReturnType<typeof createListenerMiddleware>

const createStore = () => {
  listener = createListenerMiddleware()
  addListeners(listener.startListening.withTypes<All>())
  return configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false, thunk: false }).prepend(listener.middleware),
  })
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  // Only the timers the listeners delay with: the refresh and the retry never fire.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  listener.clearListeners()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('auth listeners', () => {
  it('stores the user as it arrives and the identity of a 200', async () => {
    const user = { sub: 'sub-1', accountType: 'full', name: 'Ann', avatarUrl: 'https://cas.example/a.png' } as const
    const expiresAt = Date.now() + 600_000
    fetchMock.mockResolvedValue(json({ user, accessToken: 'token-1', expiresAt, signedOut: false }))
    const store = createStore()

    store.dispatch(getMeRequest())

    await vi.waitFor(() => expect(store.getState().auth.isBootstrapped).toBe(true))
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${LIGRETTO_CORE_URL}/api/auth/me`)
    expect(store.getState().users.entities).toEqual({ 'sub-1': user })
    expect(store.getState().auth).toMatchObject({ userId: 'sub-1', accessToken: 'token-1', expiresAt, accountType: 'full', isLoading: false })
  })

  it('fails on a 503 and logs its code', async () => {
    fetchMock.mockResolvedValue(json({ error: 'cas_unavailable' }, 503))
    const store = createStore()

    store.dispatch(getMeRequest())

    await vi.waitFor(() => expect(store.getState().auth.isLoading).toBe(false))
    expect(store.getState().auth.isBootstrapped).toBe(false)
    expect(store.getState().users.ids).toEqual([])
    expect(vi.mocked(console.error).mock.calls[0][1]).toEqual({ kind: 'error', status: 503, error: 'cas_unavailable' })
  })

  it('fails on a rejected fetch without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const store = createStore()

    expect(() => store.dispatch(getMeRequest())).not.toThrow()

    await vi.waitFor(() => expect(store.getState().auth.isLoading).toBe(false))
    expect(store.getState().auth.isBootstrapped).toBe(false)
    expect(vi.mocked(console.error).mock.calls[0][1]).toEqual({ kind: 'transport', status: undefined, error: undefined })
  })
})
