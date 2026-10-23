import { afterEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'

import { getMeSuccess } from '#ducks/auth/authActions'

import { addListeners } from './listeners'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))

const createFakeSocket = () => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  active: false,
})

type ListenerConfig = { actionCreator?: { type: string }; predicate?: unknown; effect: (action: unknown) => void }

const setup = (getAccessToken: () => string) => {
  const socket = createFakeSocket()
  vi.mocked(io).mockReturnValue(socket as never)
  const listeners: ListenerConfig[] = []
  const stops: ReturnType<typeof vi.fn>[] = []
  const startListener = (config: ListenerConfig) => {
    listeners.push(config)
    const stop = vi.fn()
    stops.push(stop)
    return stop
  }
  const cleanup = addListeners(startListener as never, vi.fn(), getAccessToken)
  const onGetMeSuccess = () =>
    listeners
      .find(config => config.actionCreator?.type === getMeSuccess.type)!
      .effect(getMeSuccess({ userId: 'sub-1', accessToken: 't', expiresAt: 0, accountType: 'guest' }))
  /** Delivers the socket-level `connect_error` the way socket.io emits it, to the handler the module registered. */
  const onConnectError = () => {
    const [, handler] = socket.on.mock.calls.find(([event]) => event === 'connect_error')!
    handler(new Error('refused'))
  }
  return { socket, stops, cleanup, onGetMeSuccess, onConnectError }
}

/** The `auth` option socket.io calls on every connection attempt. */
const readHandshakeAuth = () => {
  const [, options] = vi.mocked(io).mock.calls[0] as unknown as [string, { auth: (cb: (data: object) => void) => void }]
  const cb = vi.fn()
  options.auth(cb)
  return cb.mock.calls[0][0]
}

describe('socket listeners', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('presents the token the store holds at each connection attempt', () => {
    let token = 'token-1'
    setup(() => token)

    expect(readHandshakeAuth()).toEqual({ token: 'token-1' })

    token = 'token-2'
    expect(readHandshakeAuth()).toEqual({ token: 'token-2' })
  })

  it('reconnects on a fresh token once socket.io has given up', () => {
    const { socket, onGetMeSuccess } = setup(() => 'token')

    onGetMeSuccess()

    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it.each([
    { state: 'connected', connected: true, active: true },
    { state: 'reconnecting on its own', connected: false, active: true },
  ])('leaves a socket that is $state alone', ({ connected, active }) => {
    const { socket, onGetMeSuccess } = setup(() => 'token')
    socket.connected = connected
    socket.active = active

    onGetMeSuccess()

    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('retries a refused handshake once the store holds a newer token than the one it presented', () => {
    let token = 'token-1'
    const { socket, onConnectError } = setup(() => token)
    readHandshakeAuth()

    // The refresh landed while the handshake with token-1 was in flight; the refusal arrives after it.
    token = 'token-2'
    onConnectError()

    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it('does not retry a refusal of the token the store still holds', () => {
    const { socket, onConnectError } = setup(() => 'token-1')
    readHandshakeAuth()

    onConnectError()

    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('leaves a transport error to the reconnection socket.io runs on its own', () => {
    let token = 'token-1'
    const { socket, onConnectError } = setup(() => token)
    readHandshakeAuth()
    socket.active = true

    token = 'token-2'
    onConnectError()

    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('disconnects and unsubscribes on cleanup', () => {
    const { socket, stops, cleanup } = setup(() => 'token')

    cleanup?.()

    expect(socket.disconnect).toHaveBeenCalled()
    for (const [event, handler] of socket.on.mock.calls) {
      expect(socket.off).toHaveBeenCalledWith(event, handler)
    }
    expect(stops).not.toHaveLength(0)
    for (const stop of stops) {
      expect(stop).toHaveBeenCalled()
    }
  })
})
