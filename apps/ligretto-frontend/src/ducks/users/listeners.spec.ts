// @vitest-environment jsdom

import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { connectToRoomSuccessAction, PlayerStatus, userJoinToRoomAction, type Player } from '@memebattle/ligretto-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rootReducer } from '#app/store/rootReducer'
import { authInitialState } from '#ducks/auth/authSlice'
import { initialState as gameInitialState } from '#ducks/game'
import { LIGRETTO_CORE_URL } from '#shared/constants/config'
import type { All } from '#types/store'

import { addListeners } from './listeners'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const player = (id: string): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.InGame,
  cards: [],
  stackDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  ligrettoDeck: { isHidden: true, cards: [] },
})

const roomWith = (...ids: string[]) =>
  connectToRoomSuccessAction({ game: { ...gameInitialState.game, id: 'game', players: Object.fromEntries(ids.map(id => [id, player(id)])) } })

let listener: ReturnType<typeof createListenerMiddleware>

const createStore = () => {
  listener = createListenerMiddleware()
  addListeners(listener.startListening.withTypes<All>())
  return configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false, thunk: false }).prepend(listener.middleware),
    preloadedState: { auth: { ...authInitialState, userId: 'me', accessToken: 'token-1', isBootstrapped: true } },
  })
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

const requestedUrls = () => fetchMock.mock.calls.map(([url]) => String(url))

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  listener.clearListeners()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('users listeners', () => {
  it('looks up the players of a joined room with the access token and stores them by sub', async () => {
    const users = [
      { sub: 'p1', accountType: 'full', name: 'Ann', avatarUrl: null },
      { sub: 'p2', accountType: 'guest', name: null, avatarUrl: null },
    ]
    fetchMock.mockResolvedValue(json(users))
    const store = createStore()

    store.dispatch(roomWith('p1', 'p2'))

    await vi.waitFor(() => expect(store.getState().users.ids).toHaveLength(2))
    expect(requestedUrls()).toEqual([`${LIGRETTO_CORE_URL}/api/users?ids=p1&ids=p2`])
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token-1')
    expect(store.getState().users.entities).toEqual({ p1: users[0], p2: users[1] })
  })

  it('looks up a user who joins the room', async () => {
    const user = { sub: 'p3', accountType: 'guest', name: null, avatarUrl: null }
    fetchMock.mockResolvedValue(json([user]))
    const store = createStore()

    store.dispatch(userJoinToRoomAction({ userId: 'p3' }))

    await vi.waitFor(() => expect(store.getState().users.entities.p3).toEqual(user))
    expect(requestedUrls()).toEqual([`${LIGRETTO_CORE_URL}/api/users?ids=p3`])
  })

  it('logs a refused lookup and adds no user', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    const store = createStore()

    store.dispatch(userJoinToRoomAction({ userId: 'p3' }))

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce())
    expect(consoleError.mock.calls[0][1]).toEqual({ kind: 'error', status: 401, error: 'unauthorized' })
    expect(store.getState().users.ids).toEqual([])
  })

  it('sends no request for a room without players', async () => {
    const store = createStore()

    store.dispatch(roomWith())
    await Promise.resolve()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
