// The transport under workerd: routing, sockets, the sweep, a real eviction and the lobby. The game rules are covered by
// the plain suites in src/core, against fake ports; only the deployed runtime shows how often an object sleeps in a round.
import { env, exports } from 'cloudflare:workers'
import { abortAllDurableObjects, evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import {
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  createRoomEmitAction,
  createRoomSuccessAction,
  endRoundAction,
  GameStatus,
  leaveFromRoomEmitAction,
  PlayerStatus,
  removeRoomAction,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromStackDeckAction,
  updateGameAction,
  updateRoomsAction,
  type Game,
  type GameResults,
  type Room,
} from '@memebattle/ligretto-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../src/cloudflare/env'
import { DISCONNECT_GRACE_PERIOD_MS } from '../../src/core/game/room'
import { ROOMS_PER_HOST } from '../../src/cloudflare/lobby/lobby-do'
import { openClient, stubOutside, tokenOf, type Client, type FakeCore } from './support'

const bindings = env as unknown as Env
const worker = (exports as unknown as { default: Fetcher }).default
const lobbyStub = () => bindings.LOBBY.get(bindings.LOBBY.idFromName('global'))
const hostOf = async (roomId: string) => bindings.ROOM.get(bindings.ROOM.idFromName((await lobbyStub().resolveHost(roomId))!))
type Host = Awaited<ReturnType<typeof hostOf>>

const roomsOf = (instance: unknown) => (instance as { rooms: Map<string, { emptySince?: number }> }).rooms
const isWaitingForDeletion = (stub: Host, roomId: string) =>
  runInDurableObject(stub, instance => roomsOf(instance).get(roomId)?.emptySince !== undefined)
/** Runs the sweep as if the room had been empty for longer than the timeout. */
const sweepLongEmpty = async (stub: Host, roomId: string) => {
  await runInDurableObject(stub, instance => {
    const room = roomsOf(instance).get(roomId)
    if (room?.emptySince !== undefined) {
      room.emptySince = 0
    }
  })
  await runDurableObjectAlarm(stub)
}

let roomNumber = 0
const uniqueName = () => `Room ${crypto.randomUUID()} ${++roomNumber}`

const createRoom = async (lobby: Client, name = uniqueName()) => {
  const from = lobby.received.length
  lobby.send(createRoomEmitAction({ name }))
  const { payload } = await lobby.waitFor<{ game: Game }>(createRoomSuccessAction, from)
  return payload.game
}

const joinRoom = async (roomId: string, userId: string) => {
  const client = await openClient(worker, `/gameplay/games/${roomId}`, userId)
  await client.waitFor(connectToRoomSuccessAction)
  await client.waitFor(updateGameAction)
  return client
}

const latestGame = (client: Client) => client.received.filter(({ type }) => type === updateGameAction.type).at(-1)?.payload as Game

/** A newcomer to a running round is a spectator. */
const roomWithSpectator = async (lobby: Client) => {
  const { id } = await createRoom(lobby)
  const host = await joinRoom(id, 'host')
  const peer = await joinRoom(id, 'peer')
  await host.until(() => (latestGame(host)?.players.peer ? true : undefined))
  host.send(startGameEmitAction({ gameId: id }))
  await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))
  return { id, host, peer, watcher: await joinRoom(id, 'watcher') }
}

describe('gameplay on Durable Objects', () => {
  let core: FakeCore
  let clients: Client[]
  const track = (client: Client) => {
    clients.push(client)
    return client
  }

  beforeEach(() => {
    core = stubOutside()
    clients = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  // Without the reset the next test's rooms share a host with this test's round, whose timer blocks eviction.
  afterEach(async () => {
    for (const { socket } of clients) {
      socket.close(1000, 'test over')
    }
    await reset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('the Worker', () => {
    it('answers /health and refuses anything else that is not a socket', async () => {
      expect((await worker.fetch('http://gameplay.test/gameplay/health')).status).toBe(200)
      expect((await worker.fetch('http://gameplay.test/gameplay/lobby')).status).toBe(426)
    })

    it('answers 404 on an unknown path', async () => {
      const response = await worker.fetch(`http://gameplay.test/gameplay/nowhere?token=${await tokenOf('user')}`, {
        headers: { Upgrade: 'websocket' },
      })
      expect(response.status).toBe(404)
    })

    it('reports a missing room over the protocol, for a client to stop retrying', async () => {
      const client = await openClient(worker, `/gameplay/games/${crypto.randomUUID()}`, 'user')

      await client.waitFor(connectToRoomErrorAction)
      expect((await client.closed()).reason).toBe('room not found')
    })

    it('reports a room id that cannot exist as a missing room, for a client to stop retrying', async () => {
      const client = await openClient(worker, '/gameplay/games/not.a.room', 'user')

      await client.waitFor(connectToRoomErrorAction)
      expect((await client.closed()).reason).toBe('room not found')
    })

    it('takes the user from the token and overwrites what the client sent', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const { id } = await createRoom(lobby)

      const response = await worker.fetch(`http://gameplay.test/gameplay/games/${id}?token=${await tokenOf('real')}`, {
        headers: { Upgrade: 'websocket', 'X-User-Id': 'forged' },
      })
      const socket = response.webSocket!
      socket.accept()
      const message = await new Promise<MessageEvent>(resolve => socket.addEventListener('message', resolve))

      expect(Object.keys((JSON.parse(String(message.data)).payload.game as Game).players)).toEqual(['real'])
      socket.close(1000)
    })
  })

  describe('the Lobby', () => {
    it('sends the rooms on connect and answers a heartbeat', async () => {
      const first = track(await openClient(worker, '/gameplay/lobby', 'one'))
      const { id, name } = await createRoom(first)

      const second = track(await openClient(worker, '/gameplay/lobby', 'two'))
      const { payload } = await second.waitFor<{ rooms: Room[] }>(updateRoomsAction)

      expect(payload.rooms).toContainEqual({ uuid: id, name, playersCount: 0, playersMaxCount: 4 })

      const pong = new Promise<MessageEvent>(resolve => second.socket.addEventListener('message', resolve, { once: true }))
      second.socket.send('ping')
      expect((await pong).data).toBe('pong')
    })

    it('allows two rooms with the same name', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'one'))
      const name = uniqueName()

      const first = await createRoom(lobby, name)
      const second = await createRoom(lobby, name)

      expect(second.id).not.toBe(first.id)
    })

    it('ignores a room without a name, and a create without a payload', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'one'))

      lobby.send(createRoomEmitAction({ name: '' }))
      lobby.send({ type: createRoomEmitAction.type, payload: { name: 42 } })
      lobby.send({ type: createRoomEmitAction.type })
      await createRoom(lobby)

      expect(lobby.received.filter(({ type }) => type === createRoomSuccessAction.type)).toHaveLength(1)
      expect(core.createGameCalls).toBe(1)
    })

    it('tells nobody about a room ligretto-core did not create', async () => {
      const creator = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const watcher = track(await openClient(worker, '/gameplay/lobby', 'watcher'))
      await watcher.waitFor(updateRoomsAction)
      core.createFails = true

      creator.send(createRoomEmitAction({ name: uniqueName() }))
      await vi.waitFor(() => expect(core.createGameCalls).toBe(1))
      core.createFails = false
      const { id } = await createRoom(creator)

      expect(creator.received.filter(({ type }) => type === createRoomSuccessAction.type)).toHaveLength(1)
      const updates = watcher.received.filter(({ type }) => type === updateRoomsAction.type).slice(1)
      expect(updates).toEqual([updateRoomsAction({ rooms: [expect.objectContaining({ uuid: id })] })])
    })

    it('tells nobody about a room its host failed to start', async () => {
      const creator = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const watcher = track(await openClient(worker, '/gameplay/lobby', 'watcher'))
      await watcher.waitFor(updateRoomsAction)
      type WithBrokenHost = { failedStarts: number; placeRoom(): Promise<never> }
      await runInDurableObject(lobbyStub(), instance => {
        const target = instance as unknown as WithBrokenHost
        target.failedStarts = 0
        target.placeRoom = async () => {
          target.failedStarts++
          throw new Error('the host is down')
        }
      })

      creator.send(createRoomEmitAction({ name: uniqueName() }))

      await vi.waitFor(async () =>
        expect(await runInDurableObject(lobbyStub(), instance => (instance as unknown as WithBrokenHost).failedStarts)).toBe(1),
      )
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(creator.received.some(({ type }) => type === createRoomSuccessAction.type)).toBe(false)
      expect(watcher.received.filter(({ type }) => type === updateRoomsAction.type)).toHaveLength(1)
    })

    it('removes a room once, and a late update does not bring it back', async () => {
      const creator = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const { id } = await createRoom(creator)
      const watcher = track(await openClient(worker, '/gameplay/lobby', 'watcher'))
      await watcher.waitFor(updateRoomsAction)
      const from = watcher.received.length

      await lobbyStub().removeRoom(id)
      await lobbyStub().removeRoom(id)
      await lobbyStub().updateRoom({ uuid: id, name: 'late', playersCount: 1, playersMaxCount: 4 }, ['host'])

      await watcher.waitFor(removeRoomAction, from)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(watcher.received.slice(from)).toEqual([removeRoomAction({ uuid: id })])
      expect(await lobbyStub().resolveHost(id)).toBeUndefined()
    })

    it(`shares a host between ${ROOMS_PER_HOST} rooms and uses another for the next`, async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'one'))
      const hosts: string[] = []
      for (let index = 0; index <= ROOMS_PER_HOST; index++) {
        const { id } = await createRoom(lobby)
        hosts.push((await lobbyStub().resolveHost(id))!)
      }

      expect(new Set(hosts).size).toBeGreaterThan(1)
      const counts = new Map<string, number>()
      for (const hostId of hosts) {
        counts.set(hostId, (counts.get(hostId) ?? 0) + 1)
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(ROOMS_PER_HOST)
    })

    it('puts a new room on the fullest host with a free slot', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'one'))
      const created: Array<{ id: string; hostId: string }> = []
      for (let index = 0; index <= ROOMS_PER_HOST; index++) {
        const { id } = await createRoom(lobby)
        created.push({ id, hostId: (await lobbyStub().resolveHost(id))! })
      }
      const [fuller] = created
      await lobbyStub().removeRoom(fuller.id)

      const { id } = await createRoom(lobby)

      expect(await lobbyStub().resolveHost(id)).toBe(fuller.hostId)
      expect(created.at(-1)?.hostId).not.toBe(fuller.hostId)
    })
  })

  describe('a room', () => {
    it('joins, broadcasts and tells the Lobby', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)

      const host = track(await joinRoom(id, 'host'))
      const peer = track(await joinRoom(id, 'peer'))

      await host.until(() => (latestGame(host)?.players.peer ? true : undefined))
      await lobby.until(() =>
        lobby.received.some(
          ({ type, payload }) =>
            type === updateRoomsAction.type && (payload as { rooms: Room[] }).rooms.some(room => room.uuid === id && room.playersCount === 2),
        )
          ? true
          : undefined,
      )
      expect(latestGame(peer).players.host?.isHost).toBe(true)
    })

    it('does not cross between rooms on one host', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const first = await createRoom(lobby)
      const second = await createRoom(lobby)
      expect(await lobbyStub().resolveHost(first.id)).toBe(await lobbyStub().resolveHost(second.id))

      const here = track(await joinRoom(first.id, 'player'))
      const there = track(await joinRoom(second.id, 'player'))
      const before = there.received.length

      here.send(setPlayerStatusEmitAction({ gameId: first.id, status: PlayerStatus.ReadyToPlay }))
      await here.until(() => (latestGame(here).players.player?.status === PlayerStatus.ReadyToPlay ? true : undefined))

      expect(there.received).toHaveLength(before)
    })

    it('plays a round across two sockets', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)
      const host = track(await joinRoom(id, 'host'))
      const peer = track(await joinRoom(id, 'peer'))
      await host.until(() => (latestGame(host)?.players.peer ? true : undefined))

      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))

      await peer.until(() => (latestGame(peer).status === GameStatus.InGame ? true : undefined))
      expect(latestGame(peer).players.peer?.ligrettoDeck.cards).toHaveLength(10)

      peer.send(takeFromStackDeckAction({ gameId: id }))
      await host.until(() => (latestGame(host).players.peer?.stackOpenDeck.cards.length === 3 ? true : undefined))
    })

    it('deletes a room nobody joined, at a sweep', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)

      await sweepLongEmpty(await hostOf(id), id)

      await lobby.waitFor(removeRoomAction)
      expect(await lobbyStub().resolveHost(id)).toBeUndefined()
    })

    it('frees the room when the last player leaves', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)
      const host = await joinRoom(id, 'host')

      host.send(leaveFromRoomEmitAction())

      await host.closed()
      await lobby.waitFor(removeRoomAction)
      expect(await lobbyStub().resolveHost(id)).toBeUndefined()
    })

    it('answers a message to a room deleted while the object slept with the error, and closes', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)
      const host = await joinRoom(id, 'host')
      const stub = await hostOf(id)
      await lobbyStub().removeRoom(id)

      await evictDurableObject(stub)
      const received = host.received.length
      host.send(takeFromStackDeckAction({ gameId: id }))

      await host.waitFor(connectToRoomErrorAction, received)
      expect((await host.closed()).reason).toBe('room not found')
    })

    it('stops waking once the sweep deletes its last room', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)
      const stub = await hostOf(id)

      await sweepLongEmpty(stub, id)

      expect(await runInDurableObject(stub, instance => roomsOf(instance).size)).toBe(0)
      expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).toBeNull()
    })
  })

  describe('after an eviction', () => {
    const roomWithTwoPlayers = async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const { id } = await createRoom(lobby)
      const host = track(await joinRoom(id, 'host'))
      const peer = track(await joinRoom(id, 'peer'))
      await host.until(() => (latestGame(host)?.players.peer ? true : undefined))
      return { lobby, id, host, peer, stub: await hostOf(id) }
    }

    it('rebuilds the room around sockets that survived hibernation', async () => {
      const { id, host, stub } = await roomWithTwoPlayers()
      host.send(setPlayerStatusEmitAction({ gameId: id, status: PlayerStatus.ReadyToPlay }))
      await host.until(() => (latestGame(host).players.host?.status === PlayerStatus.ReadyToPlay ? true : undefined))

      await evictDurableObject(stub)
      const from = host.received.length
      host.send(setPlayerStatusEmitAction({ gameId: id, status: PlayerStatus.ReadyToPlay }))

      // The room that comes back is shown first, without the readiness the object forgot.
      const payload = await host.until(() =>
        host.received
          .slice(from)
          .filter(({ type }) => type === updateGameAction.type)
          .map(action => action.payload as Game)
          .find(game => game.players.host?.status === PlayerStatus.ReadyToPlay),
      )
      expect(payload).toMatchObject({ id, status: GameStatus.New })
      expect(payload.players.host).toMatchObject({ isHost: true, status: PlayerStatus.ReadyToPlay })
      expect(payload.players.peer).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
    })

    it('shows the table of the last round from ligretto-core to someone coming back', async () => {
      const { id, stub } = await roomWithTwoPlayers()
      const gameResults = { host: { roundScore: 3, gameScore: 5 }, peer: { roundScore: -2, gameScore: 1 } }
      core.gameResults.set(id, gameResults)

      await evictDurableObject(stub)
      const newcomer = track(await joinRoom(id, 'newcomer'))

      expect(latestGame(newcomer).status).toBe(GameStatus.RoundFinished)
      expect((await newcomer.waitFor(endRoundAction)).payload).toEqual(gameResults)
    })

    it('comes back without the table when ligretto-core fails', async () => {
      const { id, stub } = await roomWithTwoPlayers()
      core.gameResults.set(id, { host: { roundScore: 3, gameScore: 3 } })
      core.resultsFail = true

      await evictDurableObject(stub)
      const newcomer = track(await joinRoom(id, 'newcomer'))

      expect(latestGame(newcomer).status).toBe(GameStatus.New)
    })

    it('deletes a room nobody came back to at the next sweep, and keeps one somebody did', async () => {
      const { lobby, id, stub } = await roomWithTwoPlayers()
      const empty = await createRoom(lobby)
      expect(await lobbyStub().resolveHost(empty.id)).toBe(await lobbyStub().resolveHost(id))

      await evictDurableObject(stub)
      await runDurableObjectAlarm(stub)

      await vi.waitFor(async () => expect(await lobbyStub().resolveHost(empty.id)).toBeUndefined())
      expect(await lobbyStub().resolveHost(id)).toBeDefined()
    })

    it('gives the host role to a player still there when the host did not come back', async () => {
      const { id, host, stub } = await roomWithTwoPlayers()
      host.socket.close(1000, 'gone')

      await evictDurableObject(stub)
      const newcomer = track(await joinRoom(id, 'newcomer'))

      expect(latestGame(newcomer).players.peer?.isHost).toBe(true)
      expect(latestGame(newcomer).players.host?.isHost).toBe(false)
    })

    it('cannot happen during the countdown, and can once the round is over', async () => {
      const { id, host, peer, stub } = await roomWithTwoPlayers()
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))

      let evicted = false
      const eviction = evictDurableObject(stub).then(() => {
        evicted = true
      })
      await new Promise(resolve => setTimeout(resolve, 1_000))
      expect(evicted).toBe(false)

      host.send(leaveFromRoomEmitAction())
      await eviction
      expect(evicted).toBe(true)
    })

    it('cannot happen while any room on the object is counting down', async () => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'host'))
      const first = await createRoom(lobby)
      const second = await createRoom(lobby)
      expect(await lobbyStub().resolveHost(first.id)).toBe(await lobbyStub().resolveHost(second.id))
      const startRound = async (roomId: string) => {
        const host = track(await joinRoom(roomId, 'host'))
        const peer = track(await joinRoom(roomId, 'peer'))
        await host.until(() => (latestGame(host)?.players.peer ? true : undefined))
        host.send(startGameEmitAction({ gameId: roomId }))
        await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))
        return { host, peer }
      }
      const inFirst = await startRound(first.id)
      const inSecond = await startRound(second.id)

      let evicted = false
      const eviction = evictDurableObject(await hostOf(first.id)).then(() => {
        evicted = true
      })

      inFirst.host.send(leaveFromRoomEmitAction())
      await inFirst.peer.until(() => (latestGame(inFirst.peer).status === GameStatus.RoundFinished ? true : undefined))
      await new Promise(resolve => setTimeout(resolve, 1_000))
      expect(evicted).toBe(false)

      inSecond.host.send(leaveFromRoomEmitAction())
      await eviction
      expect(evicted).toBe(true)
    })

    it('can happen once the countdown is over, and tells the sockets still there the round is lost before any message', async () => {
      const { id, host, peer, stub } = await roomWithTwoPlayers()
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.InGame ? true : undefined))

      await evictDurableObject(stub)
      const fromHost = host.received.length
      const fromPeer = peer.received.length
      await runDurableObjectAlarm(stub)

      expect((await host.waitFor<Game>(updateGameAction, fromHost)).payload.status).toBe(GameStatus.New)
      expect((await peer.waitFor<Game>(updateGameAction, fromPeer)).payload.status).toBe(GameStatus.New)
    })

    it('loses a running round in a forced restart, and brings the room back so a new one can start', async () => {
      const { id, host, peer } = await roomWithTwoPlayers()
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))

      await abortAllDurableObjects()
      const backHost = track(await joinRoom(id, 'host'))
      expect(latestGame(backHost)).toMatchObject({ status: GameStatus.New })
      expect(latestGame(backHost).players.host).toMatchObject({ isHost: true, cards: [] })
      expect(latestGame(backHost).players.peer?.status).toBe(PlayerStatus.Disconnected)

      track(await joinRoom(id, 'peer'))
      await backHost.until(() => (latestGame(backHost).players.peer?.status !== PlayerStatus.Disconnected ? true : undefined))
      backHost.send(startGameEmitAction({ gameId: id }))
      await backHost.until(() => (latestGame(backHost).status === GameStatus.Starting ? true : undefined))

      expect(core.savedRounds).toEqual([])
    })
  })

  describe('the object around a room', () => {
    const roomOf = async (...userIds: string[]) => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const { id } = await createRoom(lobby)
      const clients: Client[] = []
      for (const userId of userIds) {
        clients.push(await joinRoom(id, userId))
      }
      await clients[0].until(() => (Object.keys(latestGame(clients[0]).players).length === userIds.length ? true : undefined))
      return { lobby, id, clients, stub: await hostOf(id) }
    }
    const withBrokenLobby = (stub: Host) =>
      runInDurableObject(stub, instance => {
        const target = instance as unknown as { lobby: { removeRoom(roomId: string): Promise<void> } }
        target.lobby = {
          ...target.lobby,
          removeRoom: async () => {
            throw new Error('the lobby is down')
          },
        }
      })
    const withLobbyBack = (stub: Host) =>
      runInDurableObject(stub, (instance, _state) => {
        const target = instance as unknown as { lobby: unknown; env: Env }
        target.lobby = target.env.LOBBY.get(target.env.LOBBY.idFromName('global'))
      })

    describe('the connections of a user', () => {
      // Waits out the real grace period, twice. The rules around it are in src/core/game/room.spec.ts.
      it('takes a host offline and hands the role over only after its last connection, in that room only', async () => {
        const { lobby, id, clients, stub } = await roomOf('host', 'peer')
        const [host, peer] = clients
        const secondTab = await joinRoom(id, 'host')
        const other = await createRoom(lobby)
        expect(await lobbyStub().resolveHost(other.id)).toBe(await lobbyStub().resolveHost(id))
        const inOtherRoom = track(await joinRoom(other.id, 'host'))
        const seenInOtherRoom = inOtherRoom.received.length
        host.send(startGameEmitAction({ gameId: id }))
        await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))

        host.socket.close(1000, 'gone')
        await new Promise(resolve => setTimeout(resolve, DISCONNECT_GRACE_PERIOD_MS + 500))
        expect(latestGame(peer).players.host?.status).not.toBe(PlayerStatus.Disconnected)

        secondTab.socket.close(1000, 'gone')
        await vi.waitFor(() => expect(latestGame(peer).players.host?.status).toBe(PlayerStatus.Disconnected), {
          timeout: DISCONNECT_GRACE_PERIOD_MS + 2_000,
          interval: 50,
        })
        expect(latestGame(peer).status).toBe(GameStatus.Pause)
        expect(inOtherRoom.received).toHaveLength(seenInOtherRoom)
        expect(latestGame(peer).players.peer?.isHost).toBe(true)
        expect(await isWaitingForDeletion(stub, id)).toBe(false)
      })

      it('sends every connection of the user out when one of them leaves', async () => {
        const { id, clients } = await roomOf('host', 'peer')
        const [host, peer] = clients
        const second = track(await joinRoom(id, 'peer'))

        peer.send(leaveFromRoomEmitAction())

        await second.waitFor(connectToRoomErrorAction)
        expect((await second.closed()).reason).toBe('left the room')
        await host.until(() => (latestGame(host).players.peer === undefined ? true : undefined))
      })

      it('closes a silent socket at a sweep, and keeps one that answered the heartbeat', async () => {
        const { id, clients, stub } = await roomOf('silent', 'talking')
        const [silent, talking] = clients
        const pong = new Promise<void>(resolve => talking.socket.addEventListener('message', ({ data }) => (data === 'pong' ? resolve() : undefined)))
        talking.socket.send('ping')
        await pong
        await runInDurableObject(stub, (_instance, state) => {
          for (const socket of state.getWebSockets(id)) {
            socket.serializeAttachment({ ...(socket.deserializeAttachment() as object), acceptedAt: 0 })
          }
        })

        await runDurableObjectAlarm(stub)

        expect(await silent.closed()).toEqual({ code: 1001, reason: 'no heartbeat' })
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(talking.closes).toEqual([])
      })
    })

    describe('the deletion of an empty room', () => {
      it('waits from when the last connection of a room closes, and stops when someone comes back', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer')
        expect(await isWaitingForDeletion(stub, id)).toBe(false)

        clients[0].socket.close(1000, 'gone')
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(await isWaitingForDeletion(stub, id)).toBe(false)

        clients[1].socket.close(1000, 'gone')
        await vi.waitFor(async () => expect(await isWaitingForDeletion(stub, id)).toBe(true))

        track(await joinRoom(id, 'peer'))
        expect(await isWaitingForDeletion(stub, id)).toBe(false)
      })

      it('waits while a spectator holds a connection', async () => {
        const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
        const { id, host, peer, watcher } = await roomWithSpectator(lobby)
        const stub = await hostOf(id)

        host.socket.close(1000, 'gone')
        peer.socket.close(1000, 'gone')
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(await isWaitingForDeletion(stub, id)).toBe(false)

        watcher.socket.close(1000, 'gone')
        await vi.waitFor(async () => expect(await isWaitingForDeletion(stub, id)).toBe(true))
      })

      it('deletes a room empty for longer than the timeout, and only that room', async () => {
        const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
        const { id } = await createRoom(lobby)
        const other = await createRoom(lobby)
        const stub = await hostOf(id)
        expect(await lobbyStub().resolveHost(other.id)).toBe(await lobbyStub().resolveHost(id))

        await sweepLongEmpty(stub, id)

        await lobby.waitFor(removeRoomAction)
        expect(await lobbyStub().resolveHost(id)).toBeUndefined()
        expect(await lobbyStub().resolveHost(other.id)).toBeDefined()
        await vi.waitFor(async () => expect(await isWaitingForDeletion(stub, id)).toBe(false))
        expect(await isWaitingForDeletion(stub, other.id)).toBe(true)
      })

      it('sends a remaining spectator out with the room', async () => {
        const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
        const { host, peer, watcher } = await roomWithSpectator(lobby)

        host.send(leaveFromRoomEmitAction())
        await host.closed()
        peer.send(leaveFromRoomEmitAction())

        await watcher.waitFor(connectToRoomErrorAction)
        expect((await watcher.closed()).reason).toBe('room deleted')
      })
    })

    it('refuses a newcomer while the Lobby is deleting the room', async () => {
      const { id, clients, stub } = await roomOf('host')
      await runInDurableObject(stub, instance => {
        const target = instance as unknown as { lobby: { removeRoom(roomId: string): Promise<void> } }
        target.lobby = { ...target.lobby, removeRoom: () => new Promise<void>(() => undefined) }
      })

      clients[0].send(leaveFromRoomEmitAction())
      await clients[0].closed()
      const newcomer = await openClient(worker, `/gameplay/games/${id}`, 'newcomer')

      await newcomer.waitFor(connectToRoomErrorAction)
      expect((await newcomer.closed()).reason).toBe('room not found')
    })

    describe('when the Lobby cannot be reached', () => {
      it('closes a finished game for a spectator still there, and retries the deletion at the next sweep', async () => {
        const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
        const { id, host, peer, watcher } = await roomWithSpectator(lobby)
        const stub = await hostOf(id)
        await withBrokenLobby(stub)

        host.send(leaveFromRoomEmitAction())
        await host.closed()
        peer.send(leaveFromRoomEmitAction())

        await watcher.waitFor(connectToRoomErrorAction)
        expect((await watcher.closed()).reason).toBe('room deleted')
        expect(await lobbyStub().resolveHost(id)).toBeDefined()

        await withLobbyBack(stub)
        await runDurableObjectAlarm(stub)

        await vi.waitFor(async () => expect(await lobbyStub().resolveHost(id)).toBeUndefined())
      })

      it('keeps an empty room it could not delete, and tries again at the next sweep', async () => {
        const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
        const { id } = await createRoom(lobby)
        const stub = await hostOf(id)
        await withBrokenLobby(stub)

        await sweepLongEmpty(stub, id)

        await new Promise(resolve => setTimeout(resolve, 100))
        expect(await lobbyStub().resolveHost(id)).toBeDefined()

        await withLobbyBack(stub)
        await runDurableObjectAlarm(stub)

        await vi.waitFor(async () => expect(await lobbyStub().resolveHost(id)).toBeUndefined())
      })
    })

    describe('a round being saved', () => {
      const round = { roundId: crypto.randomUUID(), results: [{ playerId: 'host', score: 3 }] }
      const saveRound = (stub: Host, roomId: string) =>
        runInDurableObject(stub, instance =>
          (instance as unknown as { saveRound(roomId: string, saved: typeof round): Promise<void> }).saveRound(roomId, round),
        )

      it('is sent to ligretto-core, and its table shown to everyone', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer')

        await saveRound(stub, id)

        const { payload } = await clients[1].waitFor<GameResults>(endRoundAction)
        expect(payload).toEqual({ host: { roundScore: 3, gameScore: 3 } })
        expect(core.savedRounds).toEqual([{ gameId: id, body: round }])
      })

      it('recreates nothing when the room was deleted meanwhile', async () => {
        const { id, clients, stub } = await roomOf('host')
        clients[0].send(leaveFromRoomEmitAction())
        await clients[0].closed()
        await vi.waitFor(async () => expect(await lobbyStub().resolveHost(id)).toBeUndefined())

        await saveRound(stub, id)

        expect(core.savedRounds).toHaveLength(1)
        expect(await runInDurableObject(stub, instance => roomsOf(instance).has(id))).toBe(false)
        expect(await lobbyStub().resolveHost(id)).toBeUndefined()
      })
    })
  })
})
