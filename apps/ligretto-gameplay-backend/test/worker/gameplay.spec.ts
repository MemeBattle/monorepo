// The transport under workerd: routing, sockets, the sweep, a real eviction and the lobby. The game rules are covered by
// the plain suites in src/core, against fake ports; only the deployed runtime shows how often an object sleeps in a round.
import { env, exports } from 'cloudflare:workers'
import { abortAllDurableObjects, evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import {
  becomePlayerEmitAction,
  becomeSpectatorEmitAction,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  createRoomEmitAction,
  createRoomSuccessAction,
  endRoundAction,
  GameStatus,
  kickedFromRoomAction,
  kickFromRoomEmitAction,
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

/** Every snapshot of the room the client was sent from `from` on, on connecting as well as in updates, with when it arrived. */
const snapshotsOf = (client: Client, from = 0) =>
  client.received.flatMap(({ type, payload }, index) => {
    const game =
      type === updateGameAction.type ? (payload as Game) : type === connectToRoomSuccessAction.type ? (payload as { game: Game }).game : undefined
    return game && index >= from ? [{ game, at: client.receivedAt[index] }] : []
  })
type Snapshot = ReturnType<typeof snapshotsOf>[number]

const cardsShownIn = (game: Game) =>
  [...game.playground.decks, ...game.playground.droppedDecks].reduce((count, deck) => count + (deck?.cards.length ?? 0), 0) +
  Object.values(game.players).reduce(
    (count, player) =>
      count + player!.cards.length + player!.ligrettoDeck.cards.length + player!.stackDeck.cards.length + player!.stackOpenDeck.cards.length,
    0,
  )

type HostedRoomInternals = { rooms: Map<string, { room: { current: Game } }> }

/** The countdown a round started from now on will last. */
const setCountdown = (stub: Host, roomId: string, seconds: number) =>
  runInDurableObject(stub, instance => {
    const { room } = (instance as unknown as HostedRoomInternals).rooms.get(roomId)!
    room.current = { ...room.current, config: { ...room.current.config, startingDelayInSec: seconds } }
  })

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

  describe('a countdown', () => {
    const roomWith = async (...userIds: string[]) => {
      const lobby = track(await openClient(worker, '/gameplay/lobby', 'creator'))
      const { id } = await createRoom(lobby)
      const clients: Client[] = []
      for (const userId of userIds) {
        clients.push(track(await joinRoom(id, userId)))
      }
      await clients[0].until(() => (Object.keys(latestGame(clients[0]).players).length === userIds.length ? true : undefined))
      return { id, clients, stub: await hostOf(id) }
    }
    const isDealt = (client: Client) => (latestGame(client)?.status === GameStatus.InGame ? true : undefined)
    const deals = (snapshots: Snapshot[]) => snapshots.filter(({ game }) => game.status === GameStatus.InGame)
    const expectNothingDealt = (snapshots: Snapshot[]) => {
      expect(snapshots.length).toBeGreaterThan(0)
      for (const { game } of snapshots) {
        expect(game.status).toBe(GameStatus.Starting)
        expect(cardsShownIn(game)).toBe(0)
      }
    }
    /**
     * `endsAt` is the earliest the countdown can end, taken from when the start was sent and not from the deal: one deal,
     * no earlier than that, and nothing dealt in any snapshot before it.
     */
    const expectDealtOnceAtTheEnd = (snapshots: Snapshot[], endsAt: number) => {
      const [deal, ...more] = deals(snapshots)
      expect(more).toEqual([])
      expect(deal.at).toBeGreaterThanOrEqual(endsAt)
      expect(cardsShownIn(deal.game)).toBeGreaterThan(0)
      expectNothingDealt(snapshots.slice(0, snapshots.indexOf(deal)))
    }

    it('shows everyone, newcomers and other tabs too, nothing dealt until it ends, and the deal once', async () => {
      const { id, clients } = await roomWith('host', 'peer')
      const [host, peer] = clients
      const fromHost = host.received.length
      const fromPeer = peer.received.length

      const endsAt = Date.now() + 4_000
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))
      peer.send(takeFromStackDeckAction({ gameId: id }))
      peer.send(setPlayerStatusEmitAction({ gameId: id, status: PlayerStatus.ReadyToPlay }))
      const newcomer = track(await joinRoom(id, 'newcomer'))
      const secondTab = track(await joinRoom(id, 'peer'))
      expect(Date.now()).toBeLessThan(endsAt)
      expectNothingDealt(snapshotsOf(newcomer))
      expectNothingDealt(snapshotsOf(secondTab))

      for (const client of [host, peer, newcomer, secondTab]) {
        await client.until(() => isDealt(client))
      }
      await new Promise(resolve => setTimeout(resolve, 200))

      expectDealtOnceAtTheEnd(snapshotsOf(host, fromHost), endsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(peer, fromPeer), endsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(newcomer), endsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(secondTab), endsAt)
      const [{ game: onConnect }] = snapshotsOf(newcomer)
      expect(onConnect.spectators).toEqual({ newcomer: { id: 'newcomer' } })
      expect(onConnect.players.peer).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
      const deal = latestGame(host)
      expect(Object.keys(deal.players).sort()).toEqual(['host', 'peer'])
      expect(deal.players.peer?.cards).toHaveLength(5)
      expect(deal.players.peer?.stackOpenDeck.cards).toEqual([])
    })

    it('goes on when the host leaves and two players are left, and deals to them', async () => {
      const { id, clients } = await roomWith('host', 'peer', 'third')
      const [host, peer, third] = clients
      const fromPeer = peer.received.length
      const fromThird = third.received.length

      const endsAt = Date.now() + 4_000
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))
      host.send(leaveFromRoomEmitAction())
      await peer.until(() => (latestGame(peer).players.peer?.isHost ? true : undefined))
      expect(Date.now()).toBeLessThan(endsAt)
      expectNothingDealt(snapshotsOf(peer, fromPeer))

      await peer.until(() => isDealt(peer))
      await third.until(() => isDealt(third))
      expectDealtOnceAtTheEnd(snapshotsOf(peer, fromPeer), endsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(third, fromThird), endsAt)
      expect(Object.keys(latestGame(peer).players).sort()).toEqual(['peer', 'third'])
      expect(latestGame(peer).players.third?.cards).toHaveLength(5)
    })

    // Waits out the real grace period, inside a countdown made longer than it.
    it('hands the host role on when the host goes offline, and still deals them in', async () => {
      const { id, clients, stub } = await roomWith('host', 'peer', 'third')
      const [host, peer, third] = clients
      await setCountdown(stub, id, 8)
      const fromPeer = peer.received.length
      const fromThird = third.received.length

      const endsAt = Date.now() + 8_000
      host.send(startGameEmitAction({ gameId: id }))
      await peer.until(() => (latestGame(peer).status === GameStatus.Starting ? true : undefined))
      host.socket.close(1000, 'gone')
      await vi.waitFor(() => expect(latestGame(peer).players.host?.status).toBe(PlayerStatus.Disconnected), {
        timeout: DISCONNECT_GRACE_PERIOD_MS + 2_000,
        interval: 50,
      })

      expect(Date.now()).toBeLessThan(endsAt)
      expectNothingDealt(snapshotsOf(peer, fromPeer))
      expect(latestGame(peer).players.peer?.isHost).toBe(true)
      expect(latestGame(peer).players.third?.isHost).toBe(false)

      await vi.waitFor(() => expect(latestGame(peer).status).toBe(GameStatus.InGame), { timeout: 8_000, interval: 50 })
      await third.until(() => isDealt(third))
      expectDealtOnceAtTheEnd(snapshotsOf(peer, fromPeer), endsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(third, fromThird), endsAt)
      expect(latestGame(peer).players.host).toMatchObject({ status: PlayerStatus.Disconnected, isHost: false })
      expect(latestGame(peer).players.host?.cards).toHaveLength(4)
    })

    // Waits out the real grace period, inside a countdown made longer than it.
    it('is given up when fewer than two players are online, deals nothing, and a new round can start', async () => {
      const { id, clients, stub } = await roomWith('host', 'peer')
      const [host, peer] = clients
      await setCountdown(stub, id, 30)
      const fromHost = host.received.length

      const endsAt = Date.now() + 30_000
      host.send(startGameEmitAction({ gameId: id }))
      await host.until(() => (latestGame(host).status === GameStatus.Starting ? true : undefined))
      peer.socket.close(1000, 'gone')
      await vi.waitFor(() => expect(latestGame(host).status).toBe(GameStatus.RoundFinished), {
        timeout: DISCONNECT_GRACE_PERIOD_MS + 2_000,
        interval: 50,
      })

      expect(Date.now()).toBeLessThan(endsAt)
      const cancelled = snapshotsOf(host, fromHost)
      expect(deals(cancelled)).toEqual([])
      expectNothingDealt(cancelled.slice(0, -1))
      const { game: given } = cancelled.at(-1)!
      expect(given.status).toBe(GameStatus.RoundFinished)
      expect(cardsShownIn(given)).toBe(0)
      expect(given.players).toMatchObject({
        host: { isHost: true, status: PlayerStatus.DontReadyToPlay },
        peer: { isHost: false, status: PlayerStatus.Disconnected },
      })

      const back = track(await joinRoom(id, 'peer'))
      expect(latestGame(back).status).toBe(GameStatus.RoundFinished)
      await host.until(() => (latestGame(host).players.peer?.status === PlayerStatus.DontReadyToPlay ? true : undefined))
      expect(deals(snapshotsOf(host, fromHost))).toEqual([])
      expect(deals(snapshotsOf(back))).toEqual([])

      await setCountdown(stub, id, 1)
      const fromRestart = host.received.length
      const fromBack = back.received.length
      const restartEndsAt = Date.now() + 1_000
      host.send(startGameEmitAction({ gameId: id }))

      await back.until(() => isDealt(back))
      await host.until(() => isDealt(host))
      await new Promise(resolve => setTimeout(resolve, 200))
      expectDealtOnceAtTheEnd(snapshotsOf(host, fromRestart), restartEndsAt)
      expectDealtOnceAtTheEnd(snapshotsOf(back, fromBack), restartEndsAt)
      expect(deals(snapshotsOf(host, fromHost))).toHaveLength(1)
      expect(latestGame(back).players.peer?.cards).toHaveLength(5)
      expect(core.savedRounds).toEqual([])
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
        type Lobby = { removeRoom(roomId: string): Promise<void>; updateRoom(room: unknown, playerIds: string[]): Promise<void> }
        const target = instance as unknown as { lobby: Lobby }
        const real = target.lobby
        // Spreading a stub copies none of its methods, and a failed roster update would replace this Lobby with a new stub.
        target.lobby = {
          updateRoom: (room, playerIds) => real.updateRoom(room, playerIds),
          removeRoom: async () => {
            throw new Error('the lobby is down')
          },
        }
      })
    const withRosterUpdatesFailing = (stub: Host) =>
      runInDurableObject(stub, instance => {
        const target = instance as unknown as { lobby: { updateRoom(): Promise<void> } }
        target.lobby = {
          ...target.lobby,
          updateRoom: async () => {
            throw new Error('the lobby is down')
          },
        }
      })
    const lobbyPlayerIdsOf = async (roomId: string) =>
      (await lobbyStub().getRoomsOfHost((await lobbyStub().resolveHost(roomId))!)).find(room => room.roomId === roomId)?.playerIds
    /** The host kicks the peer while the Lobby takes no roster updates. */
    const kickUnpublished = async (stub: Host, id: string, host: Client, peer: Client) => {
      await withRosterUpdatesFailing(stub)
      host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))
      await peer.closed()
      await host.until(() => (latestGame(host).players.peer === undefined ? true : undefined))
      expect(await lobbyPlayerIdsOf(id)).toContain('peer')
    }
    const withLobbyBack = (stub: Host) =>
      runInDurableObject(stub, (instance, _state) => {
        const target = instance as unknown as { lobby: unknown; env: Env }
        target.lobby = target.env.LOBBY.get(target.env.LOBBY.idFromName('global'))
      })

    it('moves a seat between users, for every tab, the Lobby and a room that comes back', async () => {
      const { lobby, id, clients, stub } = await roomOf('host', 'a', 'b', 'leaving')
      clients.forEach(track)
      const leaving = clients[3]
      const watcher = track(await joinRoom(id, 'watcher'))
      const watcherTab = track(await joinRoom(id, 'watcher'))
      expect(latestGame(watcher).spectators.watcher).toBeDefined()
      const lobbyShows = (playersCount: number) =>
        lobby.until(() =>
          lobby.received.some(
            ({ type, payload }) =>
              type === updateRoomsAction.type &&
              (payload as { rooms: Room[] }).rooms.some(room => room.uuid === id && room.playersCount === playersCount),
          )
            ? true
            : undefined,
        )

      leaving.send(becomeSpectatorEmitAction({ gameId: id }))
      await watcherTab.until(() => (latestGame(watcherTab).spectators.leaving ? true : undefined))
      await lobbyShows(3)

      watcher.send(becomePlayerEmitAction({ gameId: id }))
      await watcherTab.until(() => (latestGame(watcherTab).players.watcher ? true : undefined))
      expect(latestGame(leaving).players.watcher).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
      await lobbyShows(4)

      await evictDurableObject(stub)
      const newcomer = track(await joinRoom(id, 'newcomer'))

      expect(Object.keys(latestGame(newcomer).players).sort()).toEqual(['a', 'b', 'host', 'watcher'])
      expect(Object.keys(latestGame(newcomer).spectators).sort()).toEqual(['leaving', 'newcomer'])
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

      it('sends every connection of a kicked user out, frees the seat in the Lobby and leaves other rooms alone', async () => {
        const { lobby, id, clients } = await roomOf('host', 'peer')
        const [host, peer] = clients
        const secondTab = track(await joinRoom(id, 'peer'))
        const other = await createRoom(lobby)
        const inOtherRoom = track(await joinRoom(other.id, 'peer'))
        const seenInOtherRoom = inOtherRoom.received.length
        const seenByLobby = lobby.received.length

        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))

        for (const tab of [peer, secondTab]) {
          expect((await tab.waitFor(kickedFromRoomAction)).payload).toEqual({ roomUuid: id })
          await tab.waitFor(connectToRoomErrorAction)
          expect((await tab.closed()).reason).toBe('left the room')
        }
        await host.until(() => (latestGame(host).players.peer === undefined ? true : undefined))
        await lobby.until(() =>
          lobby.received
            .slice(seenByLobby)
            .some(
              ({ type, payload }) =>
                type === updateRoomsAction.type && (payload as { rooms: Room[] }).rooms.some(room => room.uuid === id && room.playersCount === 1),
            )
            ? true
            : undefined,
        )
        expect(inOtherRoom.received).toHaveLength(seenInOtherRoom)
        expect(inOtherRoom.closes).toEqual([])
      })

      it('ignores a kick from someone who is not the host', async () => {
        const { clients } = await roomOf('host', 'peer')
        const [host, peer] = clients
        const id = latestGame(host).id

        peer.send(kickFromRoomEmitAction({ gameId: id, userId: 'host' }))
        peer.send(setPlayerStatusEmitAction({ gameId: id, status: PlayerStatus.ReadyToPlay }))

        await host.until(() => (latestGame(host).players.peer?.status === PlayerStatus.ReadyToPlay ? true : undefined))
        expect(latestGame(host).players.host).toBeDefined()
        expect(host.received.some(({ type }) => type === kickedFromRoomAction.type)).toBe(false)
        expect(host.closes).toEqual([])
      })

      it('lets a kicked user come back through the room link', async () => {
        const { id, clients } = await roomOf('host', 'peer')
        const [host, peer] = clients

        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))
        await peer.closed()

        track(await joinRoom(id, 'peer'))
        await host.until(() => (latestGame(host).players.peer ? true : undefined))
      })

      it('ignores what was still in flight on a socket the object closed, after its user joined again', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer')
        const [host, peer] = clients
        let closedByTheObject: WebSocket | undefined
        await runInDurableObject(stub, (_instance, state) => {
          closedByTheObject = state.getWebSockets(id).find(socket => (socket.deserializeAttachment() as { userId: string }).userId === 'peer')
        })
        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))
        await peer.closed()
        const rejoined = track(await joinRoom(id, 'peer'))
        await host.until(() => (latestGame(host).players.peer ? true : undefined))

        await runInDurableObject(stub, instance => instance.webSocketMessage(closedByTheObject!, JSON.stringify(leaveFromRoomEmitAction())))
        host.send(setPlayerStatusEmitAction({ gameId: id, status: PlayerStatus.ReadyToPlay }))

        await host.until(() => (latestGame(host).players.host?.status === PlayerStatus.ReadyToPlay ? true : undefined))
        expect(latestGame(host).players.peer).toBeDefined()
        expect(rejoined.closes).toEqual([])
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

    describe('when the Lobby takes no roster update', () => {
      it('sends the roster again at the next sweep, through a new stub once the Lobby was reset', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer')
        const [host, peer] = clients
        // A reset breaks every stub that was talking to the Lobby, for good: only a new one reaches it again.
        await runInDurableObject(lobbyStub(), (_instance, state) => state.abort('reset by the test')).catch(() => undefined)

        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))
        await peer.closed()
        await host.until(() => (latestGame(host).players.peer === undefined ? true : undefined))
        expect(await lobbyPlayerIdsOf(id)).toContain('peer')

        await runDurableObjectAlarm(stub)

        expect(await lobbyPlayerIdsOf(id)).toEqual(['host'])
      })

      it('does not bring a kicked player back after a restart, and sends the roster the Lobby missed', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer')
        await kickUnpublished(stub, id, clients[0], clients[1])

        await evictDurableObject(stub)
        const newcomer = track(await joinRoom(id, 'newcomer'))

        expect(Object.keys(latestGame(newcomer).players).sort()).toEqual(['host', 'newcomer'])
        await vi.waitFor(async () => expect((await lobbyPlayerIdsOf(id))?.sort()).toEqual(['host', 'newcomer']))
      })

      it('lands the latest roster when changes overtake a slow update', async () => {
        const { id, clients, stub } = await roomOf('host', 'peer', 'third')
        const [host] = clients
        const sent: string[][] = []
        let releaseFirst = () => {}
        await runInDurableObject(stub, instance => {
          const target = instance as unknown as { lobby: { updateRoom(room: unknown, playerIds: string[]): Promise<void> } }
          const real = target.lobby
          target.lobby = {
            ...real,
            updateRoom: async (room, playerIds) => {
              sent.push(playerIds)
              if (sent.length === 1) {
                await new Promise<void>(resolve => (releaseFirst = resolve))
              }
              await real.updateRoom(room, playerIds)
            },
          }
        })

        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'peer' }))
        await host.until(() => (latestGame(host).players.peer === undefined ? true : undefined))
        host.send(kickFromRoomEmitAction({ gameId: id, userId: 'third' }))
        await host.until(() => (latestGame(host).players.third === undefined ? true : undefined))
        expect(sent).toHaveLength(1)
        // The gate belongs to the object, so only the object may open it.
        await runInDurableObject(stub, () => releaseFirst())

        await vi.waitFor(async () => expect(await lobbyPlayerIdsOf(id)).toEqual(['host']))
        expect(sent.at(-1)).toEqual(['host'])
      })
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
