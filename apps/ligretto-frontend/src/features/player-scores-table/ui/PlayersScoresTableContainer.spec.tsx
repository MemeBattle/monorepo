// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { PlayersScoresTableContainer } from './PlayersScoresTableContainer'

const createPlayer = (id: string): Player => ({
  id,
  isHost: id === 'host',
  status: PlayerStatus.DontReadyToPlay,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
})

const INVITE = 'Invite friends to join you!'
const COPIED = 'Room link copied'

const mockNavigator = (apis: { share?: unknown; canShare?: unknown; clipboard?: unknown }) => {
  for (const [key, value] of Object.entries(apis)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

const createDeferred = () => {
  let resolve: () => void = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

const renderTable = () => {
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'host', isBootstrapped: true },
      game: {
        ...initialState,
        game: {
          ...initialState.game,
          id: 'room-1',
          status: GameStatus.New,
          players: { host: createPlayer('host'), peer: createPlayer('peer') },
        },
      },
    },
  })

  render(
    <Provider store={store}>
      <PlayersScoresTableContainer />
    </Provider>,
  )

  return screen.getAllByRole('button', { name: INVITE })
}

const waitForInviteToSettle = (button: HTMLElement) => waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'))

const roomUrl = () => `${window.location.origin}/game/room-1`

describe('PlayersScoresTableContainer invitation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/game/room-1?ref=lobby#seats')
  })

  afterEach(() => {
    for (const key of ['share', 'canShare', 'clipboard']) {
      Reflect.deleteProperty(navigator, key)
    }
    window.history.replaceState(null, '', '/')
  })

  it('offers an invitation in every free seat', () => {
    expect(renderTable()).toHaveLength(2)
  })

  it('opens native sharing with the room link, without its query and fragment, and copies nothing', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share, canShare, clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)
    await waitForInviteToSettle(button)

    expect(canShare).toHaveBeenCalledWith({ url: roomUrl() })
    expect(share).toHaveBeenCalledWith({ url: roomUrl() })
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText(COPIED)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shares when the browser has no canShare check', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share, clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)
    await waitForInviteToSettle(button)

    expect(share).toHaveBeenCalledWith({ url: roomUrl() })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies the room link when sharing is unsupported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)

    expect((await screen.findByRole('status')).textContent).toBe(COPIED)
    expect(writeText).toHaveBeenCalledWith(roomUrl())
  })

  it('copies the room link when the browser cannot share it', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share, canShare: vi.fn().mockReturnValue(false), clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)

    expect(await screen.findByText(COPIED)).toBeTruthy()
    expect(share).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(roomUrl())
  })

  it('copies the room link when sharing is not permitted', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')), clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)

    expect(await screen.findByText(COPIED)).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(roomUrl())
  })

  it('reports a failure, not success, when the clipboard is unavailable', async () => {
    mockNavigator({})
    const [button] = renderTable()

    fireEvent.click(button)

    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't share the room link/)
    expect(screen.queryByText(COPIED)).toBeNull()
  })

  it('reports a failure, not success, when copying is rejected', async () => {
    mockNavigator({
      share: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
      clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) },
    })
    const [button] = renderTable()

    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(COPIED)).toBeNull()
  })

  it('keeps an empty status region exposed before the copy is confirmed in it', async () => {
    mockNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const [button] = renderTable()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    fireEvent.click(button)

    await waitFor(() => expect(status.textContent).toBe(COPIED))
    expect(screen.getByRole('status')).toBe(status)
  })

  it('confirms copying only once the clipboard has accepted the link', async () => {
    const copy = createDeferred()
    mockNavigator({ clipboard: { writeText: vi.fn().mockReturnValue(copy.promise) } })
    const [button] = renderTable()

    fireEvent.click(button)
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'))
    expect(screen.queryByText(COPIED)).toBeNull()

    copy.resolve()

    expect(await screen.findByText(COPIED)).toBeTruthy()
  })

  it('ends quietly when the user dismisses the share dialog', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError')), clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)
    await waitForInviteToSettle(button)

    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText(COPIED)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a failure without copying when sharing fails unexpectedly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new TypeError('Invalid data')), clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('starts no second invitation from any seat while one is pending', async () => {
    const firstShare = createDeferred()
    const share = vi.fn().mockReturnValueOnce(firstShare.promise).mockResolvedValue(undefined)
    mockNavigator({ share })
    const [firstSeat, secondSeat] = renderTable()

    fireEvent.click(firstSeat)
    fireEvent.click(firstSeat)
    fireEvent.click(secondSeat)
    expect(share).toHaveBeenCalledTimes(1)

    firstShare.resolve()
    await waitForInviteToSettle(firstSeat)
    fireEvent.click(secondSeat)

    expect(share).toHaveBeenCalledTimes(2)
  })

  it('clears the previous feedback when a new invitation starts', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('Denied'))
    mockNavigator({ clipboard: { writeText } })
    const [button] = renderTable()

    fireEvent.click(button)
    expect(await screen.findByText(COPIED)).toBeTruthy()

    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(COPIED)).toBeNull()
  })
})
