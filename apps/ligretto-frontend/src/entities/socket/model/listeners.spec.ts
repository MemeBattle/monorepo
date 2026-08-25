// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { socketConnectedAction } from './actions'

const handlers = new Map<string, (...args: unknown[]) => void>()
const socket = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers.set(event, handler)
    return socket
  }),
  off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (handlers.get(event) === handler) {
      handlers.delete(event)
    }
    return socket
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

import { addListeners } from './listeners'

describe('socket listeners', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
  })

  it('dispatches connected for initial connect and every reconnect, then cleans up', () => {
    const dispatch = vi.fn()
    const stopReduxListener = vi.fn()
    const cleanup = addListeners(vi.fn(() => stopReduxListener) as never, dispatch)

    expect(dispatch).not.toHaveBeenCalled()
    handlers.get('connect')?.()
    handlers.get('connect')?.()
    expect(dispatch).toHaveBeenNthCalledWith(1, socketConnectedAction())
    expect(dispatch).toHaveBeenNthCalledWith(2, socketConnectedAction())

    cleanup?.()
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('event', expect.any(Function))
    expect(stopReduxListener).toHaveBeenCalled()
    expect(socket.disconnect).toHaveBeenCalled()
  })
})
