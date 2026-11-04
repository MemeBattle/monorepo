import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameplaySocket } from './gameplay-socket'

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = 0
  sent: string[] = []
  closedWith?: number
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: (event: { code: number }) => void

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(message: string) {
    this.sent.push(message)
  }

  close(code: number) {
    this.closedWith = code
    this.readyState = 3
    this.onclose?.({ code })
  }

  serverOpens() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  serverSends(data: string) {
    this.onmessage?.({ data })
  }

  serverCloses(code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

describe('createGameplaySocket', () => {
  let token: string
  let onOpen: ReturnType<typeof vi.fn<() => void>>
  let onMessage: ReturnType<typeof vi.fn<(data: unknown) => void>>
  let socket: ReturnType<typeof createGameplaySocket>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    token = 'first token'
    onOpen = vi.fn<() => void>()
    onMessage = vi.fn<(data: unknown) => void>()
    socket = createGameplaySocket({ baseUrl: 'ws://gameplay.test', getAccessToken: () => token, onOpen, onMessage })
  })

  afterEach(() => {
    socket.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects to the endpoint with the token in the query string', () => {
    socket.connect('/lobby')

    expect(latest().url).toBe('ws://gameplay.test/lobby?token=first%20token')
  })

  it('reports the open and passes on parsed messages', () => {
    socket.connect('/lobby')
    latest().serverOpens()
    latest().serverSends('{"type":"a"}')

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith({ type: 'a' })
  })

  it('keeps a message until the socket opens', () => {
    socket.connect('/lobby')
    socket.send({ type: 'early' })
    expect(latest().sent).toEqual([])

    latest().serverOpens()
    socket.send({ type: 'late' })

    expect(latest().sent).toEqual(['{"type":"early"}', '{"type":"late"}'])
  })

  describe('switching endpoints', () => {
    it('closes the old socket, and ignores anything it still says', () => {
      socket.connect('/lobby')
      const lobby = latest()
      lobby.serverOpens()
      onOpen.mockClear()

      socket.connect('/games/a')

      expect(lobby.closedWith).toBe(1000)
      expect(latest().url).toContain('/games/a')
      lobby.serverSends('{"type":"stale"}')
      expect(onMessage).not.toHaveBeenCalled()
    })

    it('does nothing for the endpoint it is already on', () => {
      socket.connect('/games/a')
      socket.connect('/games/a')

      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('does not carry waiting messages to the new endpoint', () => {
      socket.connect('/lobby')
      socket.send({ type: 'for the lobby' })

      socket.connect('/games/a')
      latest().serverOpens()

      expect(latest().sent).toEqual([])
    })

    it('delivers a message sent just before the switch', () => {
      socket.connect('/games/a')
      const room = latest()
      room.serverOpens()

      socket.send({ type: 'leave' })
      socket.connect('/lobby')

      expect(room.sent).toEqual(['{"type":"leave"}'])
    })
  })

  describe('a lost connection', () => {
    it('keeps reopening, reading the token again', async () => {
      socket.connect('/lobby')
      const first = latest()
      first.serverOpens()
      first.serverSends('{"type":"a"}')
      token = 'second'

      first.serverCloses(1006)
      await vi.advanceTimersByTimeAsync(1_999)
      expect(FakeWebSocket.instances).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(latest().url).toContain('token=second')

      latest().serverCloses(1006)
      await vi.advanceTimersByTimeAsync(1_999)
      expect(FakeWebSocket.instances).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(FakeWebSocket.instances).toHaveLength(3)
    })

    it('retries a refused token like any other close, with the token it has by then', async () => {
      socket.connect('/lobby')
      latest().serverOpens()

      latest().serverCloses(4401)
      token = 'second'
      await vi.advanceTimersByTimeAsync(2_000)

      expect(latest().url).toContain('token=second')
    })

    it('gives up after three retries in a row, until told where to connect', async () => {
      socket.connect('/lobby')

      for (let retry = 0; retry < 3; retry++) {
        latest().serverOpens()
        latest().serverCloses(4401)
        await vi.advanceTimersByTimeAsync(2_000)
      }
      expect(FakeWebSocket.instances).toHaveLength(4)

      latest().serverCloses(4401)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(FakeWebSocket.instances).toHaveLength(4)

      socket.connect('/lobby')
      expect(FakeWebSocket.instances).toHaveLength(5)
    })

    describe('back online', () => {
      const giveUp = async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          latest().serverCloses(1006)
          await vi.advanceTimersByTimeAsync(2_000)
        }
      }

      it('reopens a socket that gave up, with what was waiting for it', async () => {
        socket.connect('/games/a')
        socket.send({ type: 'leave' })
        await giveUp()
        expect(FakeWebSocket.instances).toHaveLength(4)

        socket.resume()
        latest().serverOpens()

        expect(latest().url).toContain('/games/a')
        expect(latest().sent).toEqual(['{"type":"leave"}'])
      })

      it('starts the count of retries over', async () => {
        socket.connect('/lobby')
        latest().serverCloses(1006)
        await vi.advanceTimersByTimeAsync(2_000)
        latest().serverCloses(1006)
        await vi.advanceTimersByTimeAsync(2_000)

        socket.resume()
        for (let retry = 0; retry < 3; retry++) {
          latest().serverCloses(1006)
          await vi.advanceTimersByTimeAsync(2_000)
        }

        expect(FakeWebSocket.instances).toHaveLength(6)
      })

      it('opens no second socket while one is up or waiting to retry', async () => {
        socket.connect('/lobby')
        socket.resume()
        latest().serverCloses(1006)
        socket.resume()
        await vi.advanceTimersByTimeAsync(2_000)

        expect(FakeWebSocket.instances).toHaveLength(2)
      })

      it('opens nothing after stop', () => {
        socket.connect('/lobby')
        socket.stop()

        socket.resume()

        expect(FakeWebSocket.instances).toHaveLength(1)
      })
    })

    it('counts the retries again once a socket hears from the server', async () => {
      socket.connect('/lobby')

      for (let close = 0; close < 5; close++) {
        latest().serverOpens()
        latest().serverSends('{"type":"a"}')
        latest().serverCloses(1006)
        await vi.advanceTimersByTimeAsync(2_000)
      }

      expect(FakeWebSocket.instances).toHaveLength(6)
    })

    it('stops until told where to connect', async () => {
      socket.connect('/games/a')
      const room = latest()
      room.serverOpens()

      socket.stop()
      room.serverCloses(1000)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(FakeWebSocket.instances).toHaveLength(1)

      socket.connect('/games/a')
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
  })

  describe('the heartbeat', () => {
    it('pings an open socket and swallows the answer', async () => {
      socket.connect('/lobby')
      latest().serverOpens()

      await vi.advanceTimersByTimeAsync(20_000)
      expect(latest().sent).toEqual(['ping'])

      latest().serverSends('pong')
      expect(onMessage).not.toHaveBeenCalled()
    })

    it('abandons a socket that stopped answering and opens a new one', async () => {
      socket.connect('/lobby')
      const silent = latest()
      silent.serverOpens()

      await vi.advanceTimersByTimeAsync(60_000)

      expect(silent.closedWith).toBe(1000)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(latest()).not.toBe(silent)
    })

    it('keeps a socket that answers', async () => {
      socket.connect('/lobby')
      const healthy = latest()
      healthy.serverOpens()

      for (let tick = 0; tick < 5; tick++) {
        await vi.advanceTimersByTimeAsync(20_000)
        healthy.serverSends('pong')
      }

      expect(FakeWebSocket.instances).toHaveLength(1)
    })
  })

  it('stays down after stop', async () => {
    socket.connect('/lobby')
    const current = latest()

    socket.stop()
    current.serverCloses(1006)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
