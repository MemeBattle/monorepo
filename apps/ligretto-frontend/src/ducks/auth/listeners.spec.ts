// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import type { MeResponse } from '@memebattle/ligretto-auth/contract'

import { rootReducer } from '#app/store/rootReducer'
import { analytics } from '#entities/analytics'
import { addUser } from '#ducks/users'
import { getMe } from '#shared/api'
import { restartOnHome } from '#shared/api/authNavigation'
import { RequestError } from '#shared/api/request'
import type { All } from '#types/store'

import { getMeFailure, getMeRequest, getMeSuccess } from './authActions'
import { authInitialState } from './authSlice'
import { addListeners, REFRESH_LEAD_MS, RETRY_DELAY_MS } from './listeners'

vi.mock('#shared/api', () => ({ getMe: vi.fn(), getUsersByIds: vi.fn() }))
vi.mock('#shared/api/authNavigation', () => ({ restartOnHome: vi.fn(), navigateToSignIn: vi.fn(), navigateToLogout: vi.fn() }))
vi.mock('@sentry/browser', () => ({ setUser: vi.fn() }))
vi.mock('#entities/analytics', () => ({ analytics: { setUserProperties: vi.fn(), logEvent: vi.fn() } }))

const NOW = new Date('2026-10-24T12:00:00Z').getTime()
const TOKEN_LIFETIME_MS = 600_000

const meResponse = (
  overrides: { sub?: string; accessToken?: string; accountType?: 'guest' | 'full'; name?: string | null; signedOut?: boolean } = {},
): MeResponse => ({
  user: { sub: overrides.sub ?? 'sub-1', accountType: overrides.accountType ?? 'guest', name: overrides.name ?? null, avatarUrl: null },
  accessToken: overrides.accessToken ?? 'token-1',
  expiresAt: Date.now() + TOKEN_LIFETIME_MS,
  signedOut: overrides.signedOut ?? false,
})

/** Resolves on a later microtask, never synchronously, like a real `fetch`. */
const answerMe = (response: MeResponse) => vi.mocked(getMe).mockResolvedValueOnce({ data: response })

/** The auth listeners on a real listener middleware; the app's own middleware module starts the socket at import, so it is not used. */
const createStore = (preloadedState?: Partial<All>) => {
  const listenerMiddleware = createListenerMiddleware()
  addListeners(listenerMiddleware.startListening.withTypes<All>())
  return configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false, thunk: false }).prepend(listenerMiddleware.middleware),
    preloadedState,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('auth listeners through the listener middleware', () => {
  it('bootstraps the identity from an asynchronously answered me', async () => {
    const response = meResponse({ name: null })
    answerMe(response)
    const store = createStore()

    store.dispatch(getMeRequest())
    await vi.advanceTimersByTimeAsync(0)

    expect(store.getState().auth).toEqual({
      userId: 'sub-1',
      accessToken: 'token-1',
      expiresAt: response.expiresAt,
      accountType: 'guest',
      isLoading: false,
      isBootstrapped: true,
    })
    expect(store.getState().users.entities['sub-1']).toEqual({ casId: 'sub-1', accountType: 'guest', displayName: null, avatarUrl: null })
    expect(analytics.logEvent).toHaveBeenCalledExactlyOnceWith('User authorized')
    expect(restartOnHome).not.toHaveBeenCalled()
  })

  it('refreshes the token before expiresAt without leaving the bootstrapped state', async () => {
    answerMe(meResponse())
    const store = createStore()
    store.dispatch(getMeRequest())
    await vi.advanceTimersByTimeAsync(0)

    answerMe(meResponse({ accessToken: 'token-2' }))
    await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS - REFRESH_LEAD_MS - 1)
    expect(getMe).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)

    expect(getMe).toHaveBeenCalledTimes(2)
    expect(store.getState().auth.accessToken).toBe('token-2')
    expect(store.getState().auth.isBootstrapped).toBe(true)
    expect(analytics.logEvent).toHaveBeenCalledTimes(1)
    expect(restartOnHome).not.toHaveBeenCalled()
  })

  it.each([
    { case: 'a guest replaced by a guest', accountType: 'guest' as const, signedOut: false },
    { case: 'a full account signed out', accountType: 'full' as const, signedOut: true },
  ])('restarts the page and leaves the store untouched when me names another subject: $case', async ({ accountType, signedOut }) => {
    answerMe(meResponse({ sub: 'new-sub', accountType, signedOut, name: accountType === 'full' ? 'New' : null }))
    const store = createStore({
      auth: { ...authInitialState, userId: 'old-sub', accessToken: 'old', accountType: 'guest', isBootstrapped: true },
      users: { ids: ['old-sub'], entities: { 'old-sub': { casId: 'old-sub', accountType: 'guest', displayName: null, avatarUrl: null } } },
    })

    store.dispatch(getMeRequest())
    await vi.advanceTimersByTimeAsync(0)

    expect(restartOnHome).toHaveBeenCalledTimes(1)
    expect(store.getState().auth).toMatchObject({ userId: 'old-sub', accessToken: 'old', isLoading: true, isBootstrapped: true })
    expect(store.getState().users.entities['new-sub']).toBeUndefined()
    // No further `me` while the page goes away.
    await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS)
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it('asks me once while a request is in flight', async () => {
    answerMe(meResponse())
    const store = createStore()

    store.dispatch(getMeRequest())
    store.dispatch(getMeRequest())
    await vi.advanceTimersByTimeAsync(0)

    expect(getMe).toHaveBeenCalledTimes(1)
  })
})

type Effect = (action: unknown, listenerApi: unknown) => Promise<void>
type ListenerConfig = { actionCreator: { type: string }; effect: Effect }

const captureEffect = (actionType: string) => {
  const listeners: ListenerConfig[] = []
  addListeners(((config: ListenerConfig) => listeners.push(config)) as never)
  const listener = listeners.find(config => config.actionCreator.type === actionType)
  if (!listener) {
    throw new Error(`No listener for ${actionType}`)
  }
  return listener.effect
}

const createListenerApi = (originalState: Partial<All['auth']> = {}) => ({
  getOriginalState: () => ({ auth: { ...authInitialState, ...originalState } }),
  dispatch: vi.fn(),
  cancelActiveListeners: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
})

describe('auth listener effects', () => {
  it('dispatches getMeFailure when me fails', async () => {
    vi.mocked(getMe).mockRejectedValueOnce(new RequestError(503, { error: 'cas_unavailable' }))
    const listenerApi = createListenerApi()

    await captureEffect(getMeRequest.type)(getMeRequest(), listenerApi)

    expect(listenerApi.dispatch.mock.calls).toEqual([[getMeFailure()]])
    expect(console.error).toHaveBeenCalled()
  })

  it('does not log an authorization on a same-subject refresh', async () => {
    const response = meResponse({ accountType: 'full', name: 'Name' })
    answerMe(response)
    const listenerApi = createListenerApi({ userId: 'sub-1', isBootstrapped: true })

    await captureEffect(getMeRequest.type)(getMeRequest(), listenerApi)

    expect(listenerApi.dispatch.mock.calls).toEqual([
      [addUser({ casId: 'sub-1', accountType: 'full', displayName: 'Name', avatarUrl: null })],
      [getMeSuccess({ userId: 'sub-1', accessToken: 'token-1', expiresAt: response.expiresAt, accountType: 'full' })],
    ])
    expect(analytics.logEvent).not.toHaveBeenCalled()
    expect(restartOnHome).not.toHaveBeenCalled()
  })

  it('schedules the refresh REFRESH_LEAD_MS before expiresAt', async () => {
    const listenerApi = createListenerApi()

    await captureEffect(getMeSuccess.type)(
      getMeSuccess({ userId: 'sub-1', accessToken: 't', expiresAt: NOW + TOKEN_LIFETIME_MS, accountType: 'guest' }),
      listenerApi,
    )

    expect(listenerApi.cancelActiveListeners).toHaveBeenCalled()
    expect(listenerApi.delay).toHaveBeenCalledExactlyOnceWith(570_000)
    expect(listenerApi.dispatch).toHaveBeenCalledExactlyOnceWith(getMeRequest())
  })

  it('refreshes at once when expiresAt is already past', async () => {
    const listenerApi = createListenerApi()

    await captureEffect(getMeSuccess.type)(
      getMeSuccess({ userId: 'sub-1', accessToken: 't', expiresAt: NOW - 1_000, accountType: 'guest' }),
      listenerApi,
    )

    expect(listenerApi.delay).toHaveBeenCalledExactlyOnceWith(0)
    expect(listenerApi.dispatch).toHaveBeenCalledExactlyOnceWith(getMeRequest())
  })

  it('retries a failed me after RETRY_DELAY_MS', async () => {
    const listenerApi = createListenerApi()

    await captureEffect(getMeFailure.type)(getMeFailure(), listenerApi)

    expect(listenerApi.cancelActiveListeners).toHaveBeenCalled()
    expect(listenerApi.delay).toHaveBeenCalledExactlyOnceWith(RETRY_DELAY_MS)
    expect(listenerApi.dispatch).toHaveBeenCalledExactlyOnceWith(getMeRequest())
  })
})
