// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'

import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { RoomInviteLink } from './RoomInviteLink'

const INVITE = 'Invite friends to join you!'
const COPIED = 'Room link copied'
const FAILED = "Couldn't share the room link. Copy it from the address bar instead."

const createDeferred = () => {
  let resolve: () => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = () => onResolve()
    reject = onReject
  })
  return { promise, resolve, reject }
}

const mockNavigator = (apis: { share?: unknown; clipboard?: unknown }) => {
  for (const [key, value] of Object.entries(apis)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

const renderInviteLink = () => {
  const store = createMockStore({
    preloadedState: { game: { ...initialState, game: { ...initialState.game, id: 'room-1' } } },
  })

  render(
    <Provider store={store}>
      <RoomInviteLink />
    </Provider>,
  )

  return screen.getByRole('button', { name: INVITE })
}

describe('RoomInviteLink', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.history.replaceState(null, '', '/game/room-1?ref=lobby#seats')
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const key of ['share', 'clipboard']) {
      Reflect.deleteProperty(navigator, key)
    }
    window.history.replaceState(null, '', '/')
  })

  it('shares the room link, without the query and fragment, and shows no tooltip', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share })
    const link = renderInviteLink()

    fireEvent.click(link)

    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/game/room-1` }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows "Room link copied" in a tooltip for 2 seconds and announces it', async () => {
    mockNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const link = renderInviteLink()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    fireEvent.click(link)

    expect((await screen.findByRole('tooltip')).textContent).toBe(COPIED)
    expect(status.textContent).toBe(COPIED)

    await act(() => vi.advanceTimersByTimeAsync(1900))
    expect(screen.getByRole('tooltip')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(status.textContent).toBe('')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('ignores an earlier click that settles first and keeps the latest feedback for 2 seconds', async () => {
    const firstCopy = createDeferred()
    const secondCopy = createDeferred()
    mockNavigator({ clipboard: { writeText: vi.fn().mockReturnValueOnce(firstCopy.promise).mockReturnValueOnce(secondCopy.promise) } })
    const link = renderInviteLink()

    fireEvent.click(link)
    fireEvent.click(link)
    firstCopy.resolve()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole('status').textContent).toBe('')

    await act(() => vi.advanceTimersByTimeAsync(1500))
    secondCopy.reject(new DOMException('Denied', 'NotAllowedError'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(FAILED))

    await act(() => vi.advanceTimersByTimeAsync(1900))
    expect(screen.getByRole('status').textContent).toBe(FAILED)

    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('keeps the latest click feedback when an earlier click settles after it', async () => {
    const firstCopy = createDeferred()
    const secondCopy = createDeferred()
    mockNavigator({ clipboard: { writeText: vi.fn().mockReturnValueOnce(firstCopy.promise).mockReturnValueOnce(secondCopy.promise) } })
    const link = renderInviteLink()

    fireEvent.click(link)
    fireEvent.click(link)
    secondCopy.resolve()
    expect((await screen.findByRole('tooltip')).textContent).toBe(COPIED)

    firstCopy.reject(new DOMException('Denied', 'NotAllowedError'))
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(screen.getByRole('tooltip').textContent).toBe(COPIED)
    expect(screen.getByRole('status').textContent).toBe(COPIED)
  })

  it('shows no stale feedback when the latest click is cancelled', async () => {
    const firstShare = createDeferred()
    mockNavigator({
      share: vi.fn().mockReturnValueOnce(firstShare.promise).mockRejectedValueOnce(new DOMException('Canceled', 'AbortError')),
    })
    const link = renderInviteLink()

    fireEvent.click(link)
    fireEvent.click(link)
    await act(() => vi.advanceTimersByTimeAsync(0))
    firstShare.reject(new TypeError('Invalid data'))
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows the failure in a tooltip, not the copy confirmation', async () => {
    mockNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } })
    const link = renderInviteLink()

    fireEvent.click(link)

    expect((await screen.findByRole('tooltip')).textContent).toBe(FAILED)
    expect(screen.queryByText(COPIED)).toBeNull()
  })

  it('shows no tooltip when the user dismisses the share dialog', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError'))
    mockNavigator({ share })
    const link = renderInviteLink()

    fireEvent.click(link)

    await waitFor(() => expect(share).toHaveBeenCalled())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
