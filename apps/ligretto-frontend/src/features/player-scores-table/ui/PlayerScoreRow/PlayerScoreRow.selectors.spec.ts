// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import type { Game, GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState, setGameResultAction, updateGameAction } from '#ducks/game'
import { addUser } from '#ducks/users'
import { createMockStore } from '#testing/lib/createMockStore'
import { playerRowSelector } from './PlayerScoreRow.selectors'

const createPlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.DontReadyToPlay,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

const results: GameResults = { host: { roundScore: 2, gameScore: 5 }, peer: { roundScore: 1, gameScore: 3 } }

const createStore = () => {
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'host', isBootstrapped: true },
      game: {
        ...initialState,
        results,
        game: {
          ...initialState.game,
          id: 'room-1',
          status: GameStatus.New,
          players: { host: createPlayer('host', { isHost: true }), peer: createPlayer('peer') },
        },
      },
    },
  })
  store.dispatch(addUser({ sub: 'host', accountType: 'full', name: 'Ada', avatarUrl: null }))
  store.dispatch(addUser({ sub: 'peer', accountType: 'full', name: 'Grace', avatarUrl: null }))
  return store
}

/** The server sends the whole room, with every player a new object. */
const withPlayers = (game: Game, players: Game['players']): Game => ({ ...structuredClone(game), players })

describe('playerRowSelector', () => {
  let store: ReturnType<typeof createStore>
  const hostRow = () => playerRowSelector(store.getState(), 'host')

  beforeEach(() => {
    store = createStore()
    playerRowSelector.resetRecomputations()
  })

  it('builds the row of the player from the room, the results and their profile', () => {
    expect(hostRow()).toEqual({
      username: 'Ada',
      avatar: expect.any(String),
      roundScore: 2,
      gameScore: 5,
      isViewer: true,
      isHost: true,
      status: PlayerStatus.DontReadyToPlay,
    })
  })

  it.each([
    ['the server resends the room unchanged', (current: Game) => updateGameAction(structuredClone(current))],
    [
      'another player changes',
      (current: Game) =>
        updateGameAction(withPlayers(current, { ...current.players, peer: createPlayer('peer', { status: PlayerStatus.ReadyToPlay }) })),
    ],
    ['only the results of another player change', () => setGameResultAction({ ...results, peer: { roundScore: 7, gameScore: 10 } })],
    ['another user’s profile changes', () => addUser({ sub: 'peer', accountType: 'full', name: 'Grace H.', avatarUrl: null })],
  ])('keeps the same row, without recomputing it, when %s', (_label, change) => {
    const before = hostRow()
    const recomputations = playerRowSelector.recomputations()

    store.dispatch(change(store.getState().game.game))

    expect(hostRow()).toBe(before)
    expect(playerRowSelector.recomputations()).toBe(recomputations)
  })

  it.each([
    [
      'their status',
      (current: Game) =>
        updateGameAction(
          withPlayers(current, { ...current.players, host: createPlayer('host', { isHost: true, status: PlayerStatus.ReadyToPlay }) }),
        ),
      { status: PlayerStatus.ReadyToPlay },
    ],
    [
      'whether they host',
      (current: Game) => updateGameAction(withPlayers(current, { ...current.players, host: createPlayer('host') })),
      { isHost: false },
    ],
    ['their results', () => setGameResultAction({ ...results, host: { roundScore: -4, gameScore: 1 } }), { roundScore: -4, gameScore: 1 }],
    ['their profile', () => addUser({ sub: 'host', accountType: 'full', name: 'Ada L.', avatarUrl: null }), { username: 'Ada L.' }],
  ])('builds a new row when %s changes', (_label, change, expected) => {
    const before = hostRow()
    const recomputations = playerRowSelector.recomputations()

    store.dispatch(change(store.getState().game.game))

    expect(hostRow()).not.toBe(before)
    expect(hostRow()).toMatchObject(expected)
    expect(playerRowSelector.recomputations()).toBe(recomputations + 1)
  })

  it('gives no row once the player has left', () => {
    const current = store.getState().game.game

    store.dispatch(updateGameAction(withPlayers(current, { peer: current.players.peer })))

    expect(hostRow()).toBeUndefined()
  })
})
