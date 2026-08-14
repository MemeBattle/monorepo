import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStatus, PlayerStatus, type Game } from '@memebattle/ligretto-shared'

import { ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS, DISCONNECT_GRACE_PERIOD_MS, HOST_HANDOVER_TIMEOUT_MS } from '../../../config'
import type { Database } from '../../../database'
import { IOC_TYPES } from '../../../IOC_TYPES'
import { createIOC } from '../../../inversify.config'
import type { GameConnectionService } from '../game-connection.service'
import type { UserService } from '../../../entities/user'

const game: Game = {
  id: 'game',
  name: 'game',
  status: GameStatus.InGame,
  players: {
    host: {
      id: 'host',
      isHost: true,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { cards: [], isHidden: true },
      stackDeck: { cards: [], isHidden: true },
      stackOpenDeck: { cards: [], isHidden: false },
    },
    peer: {
      id: 'peer',
      isHost: false,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { cards: [], isHidden: true },
      stackDeck: { cards: [], isHidden: true },
      stackOpenDeck: { cards: [], isHidden: false },
    },
  },
  spectators: {},
  playground: { decks: [], droppedDecks: [] },
  config: { playersMaxCount: 4, startingDelayInSec: 0, maxCardsOnTable: 12 },
}

describe('GameConnectionService', () => {
  let database: Database
  let users: UserService
  let service: GameConnectionService

  beforeEach(async () => {
    vi.useFakeTimers()
    const container = createIOC()
    database = container.get(IOC_TYPES.Database)
    users = container.get(IOC_TYPES.UserService)
    service = container.get(IOC_TYPES.GameConnectionService)
    await database.set(storage => {
      storage.games.game = structuredClone(game)
      storage.users.host = { id: 'host', socketIds: [], currentGameId: 'game' }
      storage.users.peer = { id: 'peer', socketIds: ['peer-socket'], currentGameId: 'game' }
    })
  })

  it('retains the seat and board but marks the last-socket player offline after grace and pauses below two online', async () => {
    const onUpdate = vi.fn()

    service.transportDisconnected('game', 'host', { onUpdate, onDelete: vi.fn() })
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS - 1)
    expect((await database.get(storage => storage.games.game)).players.host?.status).toBe(PlayerStatus.InGame)

    await vi.advanceTimersByTimeAsync(1)
    const retained = await database.get(storage => storage.games.game)
    expect({ ...retained.players.host, status: game.players.host?.status }).toEqual(game.players.host)
    expect(retained.players.host?.status).toBe(PlayerStatus.Disconnected)
    expect(retained.status).toBe(GameStatus.Pause)
    expect(onUpdate).toHaveBeenCalledWith(retained)
  })

  it('cancels the grace transition when the same stable user reconnects', async () => {
    service.transportDisconnected('game', 'host', { onUpdate: vi.fn(), onDelete: vi.fn() })
    await users.connectUser({ userId: 'host', socketId: 'replacement' })
    await service.reconnected('game', 'host', { onUpdate: vi.fn(), onDelete: vi.fn() })

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    const retained = await database.get(storage => storage.games.game)
    expect(retained.players.host?.status).toBe(PlayerStatus.InGame)
    expect(retained.status).toBe(GameStatus.InGame)
  })

  it.each([PlayerStatus.ReadyToPlay, PlayerStatus.DontReadyToPlay])('restores the canonical lobby status %s after reconnect', async status => {
    await database.set(storage => {
      storage.games.game = {
        ...storage.games.game,
        status: GameStatus.New,
        players: {
          ...storage.games.game.players,
          host: { ...storage.games.game.players.host!, status },
        },
      }
    })
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }

    service.transportDisconnected('game', 'host', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    await users.connectUser({ userId: 'host', socketId: 'replacement' })
    await service.reconnected('game', 'host', events)

    expect((await database.get(storage => storage.games.game)).players.host?.status).toBe(status)
  })

  it('ignores a stale grace callback after a later disconnect restarts the deadline', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    service.transportDisconnected('game', 'host', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS - 1)
    service.transportDisconnected('game', 'host', events)

    await vi.advanceTimersByTimeAsync(1)
    expect((await database.get(storage => storage.games.game)).players.host?.status).toBe(PlayerStatus.InGame)

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS - 1)
    expect((await database.get(storage => storage.games.game)).players.host?.status).toBe(PlayerStatus.Disconnected)
    expect(events.onUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not pause when one of multiple sockets remains online', async () => {
    await users.connectUser({ userId: 'host', socketId: 'remaining' })
    service.transportDisconnected('game', 'host', { onUpdate: vi.fn(), onDelete: vi.fn() })

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)

    const retained = await database.get(storage => storage.games.game)
    expect(retained.players.host?.status).toBe(PlayerStatus.InGame)
    expect(retained.status).toBe(GameStatus.InGame)
  })

  it('hands an absent host to the deterministic online player after the timeout', async () => {
    await database.set(storage => {
      storage.games.game.players.alpha = { ...structuredClone(game.players.peer!), id: 'alpha' }
      storage.users.alpha = { id: 'alpha', socketIds: ['alpha-socket'], currentGameId: 'game' }
    })
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    service.transportDisconnected('game', 'host', events)

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + HOST_HANDOVER_TIMEOUT_MS)

    const handedOver = await database.get(storage => storage.games.game)
    expect(handedOver.players.alpha?.isHost).toBe(true)
    expect(handedOver.players.peer?.isHost).toBe(false)
    expect(handedOver.players.host?.isHost).toBe(false)
    expect(Reflect.get(service, 'hostDeadlines').has('game')).toBe(false)
  })

  it('cancels host handover when the original host reconnects', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    service.transportDisconnected('game', 'host', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    await users.connectUser({ userId: 'host', socketId: 'replacement' })
    await service.reconnected('game', 'host', events)

    await vi.advanceTimersByTimeAsync(HOST_HANDOVER_TIMEOUT_MS)

    const retained = await database.get(storage => storage.games.game)
    expect(retained.players.host?.isHost).toBe(true)
    expect(retained.players.host?.status).toBe(PlayerStatus.InGame)
  })

  it('hands over an expired host deadline when a player reconnects after nobody was online', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + HOST_HANDOVER_TIMEOUT_MS)

    expect((await database.get(storage => storage.games.game)).players.host?.isHost).toBe(true)
    await users.connectUser({ userId: 'peer', socketId: 'replacement' })
    const reconnected = await service.reconnected('game', 'peer', events)

    expect(reconnected?.players.peer?.isHost).toBe(true)
    expect(reconnected?.players.host?.isHost).toBe(false)
  })

  it('deletes an all-offline room and stale associations only after the deletion timeout', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS - 1)
    expect(await database.get(storage => storage.games.game)).toBeDefined()

    await vi.advanceTimersByTimeAsync(1)

    expect(await database.get(storage => storage.games.game)).toBeUndefined()
    expect(await users.getUser('host')).toBeUndefined()
    expect(await users.getUser('peer')).toBeUndefined()
    expect(events.onDelete).toHaveBeenCalledWith('game')
  })

  it('cancels all-offline deletion when any retained player reconnects', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    await users.connectUser({ userId: 'peer', socketId: 'replacement' })
    await service.reconnected('game', 'peer', events)

    await vi.advanceTimersByTimeAsync(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

    expect(await database.get(storage => storage.games.game)).toBeDefined()
    expect(events.onDelete).not.toHaveBeenCalled()
  })

  it('does not delete an otherwise offline room while a retained spectator has a live socket', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await database.set(storage => {
      storage.games.game.spectators.spectator = { id: 'spectator' }
      storage.users.spectator = { id: 'spectator', socketIds: ['spectator-socket'], currentGameId: 'game' }
    })
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

    expect(await database.get(storage => storage.games.game)).toBeDefined()
    expect(await users.getUser('spectator')).toBeDefined()
    expect(events.onDelete).not.toHaveBeenCalled()
  })

  it('deletes the room after the last retained spectator also disconnects', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await database.set(storage => {
      storage.games.game.spectators.spectator = { id: 'spectator' }
      storage.users.spectator = { id: 'spectator', socketIds: ['spectator-socket'], currentGameId: 'game' }
    })
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)
    expect(await database.get(storage => storage.games.game)).toBeDefined()

    await users.disconnectionHandler({ userId: 'spectator', socketId: 'spectator-socket' })
    service.transportDisconnected('game', 'spectator', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

    expect(await database.get(storage => storage.games.game)).toBeUndefined()
    expect(events.onDelete).toHaveBeenCalledWith('game')
  })

  it('ignores a stale deletion timer when a participant reconnects before atomic removal', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS - 1)

    await users.connectUser({ userId: 'peer', socketId: 'replacement' })
    await vi.advanceTimersByTimeAsync(1)

    expect(await database.get(storage => storage.games.game)).toBeDefined()
    expect(await users.getUser('peer')).toMatchObject({ socketIds: ['replacement'], currentGameId: 'game' })
    expect(events.onDelete).not.toHaveBeenCalled()
  })

  it('removes an offline spectator from the game after the grace period', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await database.set(storage => {
      storage.games.game.spectators.watcher = { id: 'watcher' }
      storage.users.watcher = { id: 'watcher', socketIds: [], currentGameId: 'game' }
    })

    service.transportDisconnected('game', 'watcher', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)

    expect(await database.get(storage => storage.games.game.spectators.watcher)).toBeUndefined()
    expect(await database.get(storage => storage.users.watcher?.currentGameId)).toBeUndefined()
    expect(events.onUpdate).toHaveBeenCalled()
  })

  it('retries deletion until the lingering participant fully disconnects', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await users.disconnectionHandler({ userId: 'peer', socketId: 'peer-socket' })
    service.transportDisconnected('game', 'host', events)
    service.transportDisconnected('game', 'peer', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
    // The peer opens a socket elsewhere (e.g. the lobby) without rejoining the room.
    await users.connectUser({ userId: 'peer', socketId: 'lobby-socket' })

    await vi.advanceTimersByTimeAsync(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)
    expect(await database.get(storage => storage.games.game)).toBeDefined()

    await users.disconnectionHandler({ userId: 'peer', socketId: 'lobby-socket' })
    await vi.advanceTimersByTimeAsync(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

    expect(await database.get(storage => storage.games.game)).toBeUndefined()
    expect(events.onDelete).toHaveBeenCalledWith('game')
  })

  it('re-arms deletion when an already-disconnected player drops another socket', async () => {
    const events = { onUpdate: vi.fn(), onDelete: vi.fn() }
    await database.set(storage => {
      const game = storage.games.game
      storage.games.game = {
        ...game,
        players: {
          host: { ...game.players.host!, status: PlayerStatus.Disconnected },
          peer: { ...game.players.peer!, status: PlayerStatus.Disconnected },
        },
      }
      storage.users.host = { id: 'host', socketIds: ['late-socket'], currentGameId: 'game' }
      storage.users.peer = { id: 'peer', socketIds: [], currentGameId: 'game' }
    })

    // No deletion timer is pending; the host briefly reconnects to the lobby
    // and drops again — the grace expiry must re-arm deletion for the room.
    await users.disconnectionHandler({ userId: 'host', socketId: 'late-socket' })
    service.transportDisconnected('game', 'host', events)
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS + ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)

    expect(await database.get(storage => storage.games.game)).toBeUndefined()
    expect(events.onDelete).toHaveBeenCalledWith('game')
  })

  it('cancels a pending grace transition on explicit leave', async () => {
    service.transportDisconnected('game', 'host', { onUpdate: vi.fn(), onDelete: vi.fn() })
    service.explicitLeave('game', 'host')

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)

    expect((await database.get(storage => storage.games.game)).players.host?.status).toBe(PlayerStatus.InGame)
  })
})
