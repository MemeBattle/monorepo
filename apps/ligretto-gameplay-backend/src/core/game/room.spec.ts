import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CardColors,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  endRoundAction,
  GameStatus,
  PlayerStatus,
  updateGameAction,
  userJoinToRoomAction,
  type Game as GameState,
  type GameResults,
} from '@memebattle/ligretto-shared'
import { DISCONNECT_GRACE_PERIOD_MS, Room } from './room'
import { createGame } from './model/room'
import { FakeConnection } from '../ports.fake'
import { broadcastTo, gameInRound, playerOf } from './ports.fake'

const clearedTable = { decks: new Array(12).fill(null), droppedDecks: [] }
const gameResults: GameResults = { host: { roundScore: 2, gameScore: 2 } }
const card = { color: CardColors.red, value: 1, playerId: 'host' }

describe('Room', () => {
  let connections: FakeConnection[]

  const roomOf = (state: GameState, connected: FakeConnection[] = []) => {
    connections.push(...connected)
    return new Room(structuredClone(state), {
      broadcast: broadcastTo(connections),
    })
  }
  const join = (room: Room, userId: string) => {
    const connection = new FakeConnection(room.id, userId)
    connections.push(connection)
    room.join(userId, connection)
    return connection
  }
  /** The connection is lost and the grace period runs out. */
  const goOffline = (room: Room, userId: string) => {
    room.disconnect(userId)
    vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    connections = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('connecting', () => {
    it('makes the first player the host', () => {
      const room = roomOf(createGame('game', 'Room'))

      room.join('host', new FakeConnection('game', 'host'))

      expect(room.state.players.host).toMatchObject({ isHost: true, status: PlayerStatus.DontReadyToPlay })
    })

    it('does not make a second player the host', () => {
      const room = roomOf(createGame('game', 'Room'))
      join(room, 'host')

      join(room, 'peer')

      expect(room.state.players.peer?.isHost).toBe(false)
    })

    it('adds no seat for someone already in the room', () => {
      const room = roomOf(createGame('game', 'Room'))
      join(room, 'host')
      const before = structuredClone(room.state)

      const outcome = room.join('host', new FakeConnection('game', 'host'))

      expect(room.state).toEqual(before)
      expect(outcome).toBeUndefined()
    })

    it.each([
      ['a paused game', GameStatus.Pause],
      ['a running round', GameStatus.InGame],
    ])('makes a newcomer to %s a spectator', (_label, status) => {
      const room = roomOf(gameInRound({ status }))

      join(room, 'newcomer')

      expect(room.state.spectators.newcomer).toBeDefined()
      expect(room.state.players.newcomer).toBeUndefined()
    })

    it('makes a newcomer to a full game a spectator', () => {
      const room = roomOf(gameInRound({ status: GameStatus.New, config: { playersMaxCount: 2, startingDelayInSec: 4, maxCardsOnTable: 12 } }))

      join(room, 'newcomer')

      expect(room.state.spectators.newcomer).toBeDefined()
    })

    it('tells the joiner the room, and the others about the newcomer', () => {
      const room = roomOf(createGame('game', 'Room'))
      const first = join(room, 'host')
      first.sent = []
      const second = new FakeConnection('game', 'peer')
      connections.push(second)

      room.join('peer', second)

      expect(first.sent).toEqual([updateGameAction(room.state), userJoinToRoomAction({ userId: 'peer' })])
      expect(second.sent).toEqual([connectToRoomSuccessAction({ game: room.state }), updateGameAction(room.state)])
    })

    it('tells the others nothing about a newcomer when someone returns', () => {
      const staying = new FakeConnection('game', 'peer')
      const room = roomOf(gameInRound(), [staying])

      join(room, 'host')

      expect(staying.sent).toEqual([updateGameAction(room.state)])
    })

    const finishedRound = () => {
      const room = roomOf(
        gameInRound({
          players: {
            host: playerOf('host', { isHost: true, cards: [null], ligrettoDeck: { isHidden: true, cards: [card] } }),
            peer: playerOf('peer'),
          },
        }),
      )
      room.gameplay.takeFromLigretto('host')
      room.showRoundResults(gameResults)
      return room
    }

    it('sends the last results to someone joining between rounds', () => {
      const connection = join(finishedRound(), 'newcomer')

      expect(connection.sent.at(-1)).toEqual(endRoundAction(gameResults))
    })

    it('sends no results when there are none to show', () => {
      const room = finishedRound()
      room.gameplay.startRound('host')

      const connection = join(room, 'newcomer')

      expect(connection.sentOfType(endRoundAction)).toEqual([])
    })

    it('stops the wait for this user', () => {
      const room = roomOf(createGame('game', 'Room'))
      join(room, 'host')
      room.disconnect('host')

      join(room, 'host')
      vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS)

      expect(vi.getTimerCount()).toBe(0)
      expect(room.state.players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
    })
  })

  describe('the results of a round', () => {
    const finished = () => gameInRound({ status: GameStatus.RoundFinished })

    it('shows them to everyone between rounds', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(finished(), [watcher])

      room.showRoundResults(gameResults)

      expect(watcher.sent).toEqual([endRoundAction(gameResults)])
    })

    it('does not show them during the next round', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(gameInRound(), [watcher])

      room.showRoundResults(gameResults)

      expect(watcher.sent).toEqual([])
    })

    it('forgets the earlier table when a save failed', () => {
      const room = roomOf(finished())
      room.showRoundResults(gameResults)

      room.showRoundResults()

      expect(join(room, 'newcomer').sentOfType(endRoundAction)).toEqual([])
    })

    it('sends the table it was restored with to someone joining', () => {
      const room = new Room(finished(), { broadcast: broadcastTo(connections), results: gameResults })

      expect(join(room, 'host').sent.at(-1)).toEqual(endRoundAction(gameResults))
    })

    it('sends no empty table to someone joining', () => {
      const room = roomOf(finished())
      room.showRoundResults({})

      expect(join(room, 'newcomer').sentOfType(endRoundAction)).toEqual([])
    })
  })

  describe('showing the room to everyone', () => {
    it('sends the state and the table of the last round', () => {
      const host = new FakeConnection('game', 'host')
      const peer = new FakeConnection('game', 'peer')
      connections.push(host, peer)
      const state = gameInRound({ status: GameStatus.RoundFinished })
      const room = new Room(state, { broadcast: broadcastTo(connections), results: gameResults })

      room.showToEveryone()

      for (const connection of [host, peer]) {
        expect(connection.sent).toEqual([updateGameAction(state), endRoundAction(gameResults)])
      }
    })

    it('sends no table when there is none to show', () => {
      const host = new FakeConnection('game', 'host')
      const room = roomOf(createGame('game', 'Room'), [host])

      room.showToEveryone()

      expect(host.sent).toEqual([updateGameAction(room.state)])
    })
  })

  describe('readiness', () => {
    const lobby = (status = GameStatus.New) =>
      gameInRound({ status, players: { host: playerOf('host', { isHost: true, status: PlayerStatus.DontReadyToPlay }) } })

    it.each([PlayerStatus.ReadyToPlay, PlayerStatus.DontReadyToPlay])('allows %s between rounds and shows it to everyone', status => {
      const connection = new FakeConnection('game', 'host')
      const room = roomOf(lobby(), [connection])

      room.setReadiness('host', status)

      expect(room.state.players.host?.status).toBe(status)
      expect(connection.sent).toEqual([updateGameAction(room.state)])
    })

    it('allows it after a finished round', () => {
      const room = roomOf(lobby(GameStatus.RoundFinished))

      room.setReadiness('host', PlayerStatus.ReadyToPlay)

      expect(room.state.players.host?.status).toBe(PlayerStatus.ReadyToPlay)
    })

    it.each([PlayerStatus.InGame, PlayerStatus.Disconnected])('refuses the client-controlled status %s', status => {
      const connection = new FakeConnection('game', 'host')
      const room = roomOf(lobby(), [connection])

      room.setReadiness('host', status)

      expect(room.state.players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(connection.sent).toEqual([])
    })

    it.each([
      ['a spectator', gameInRound({ status: GameStatus.New, players: {}, spectators: { host: { id: 'host' } } })],
      ['a disconnected player', gameInRound({ status: GameStatus.New, players: { host: playerOf('host', { status: PlayerStatus.Disconnected }) } })],
      ['a running round', gameInRound()],
    ])('refuses %s', (_label, state) => {
      const room = roomOf(state)
      const before = structuredClone(room.state)

      room.setReadiness('host', PlayerStatus.ReadyToPlay)

      expect(room.state).toEqual(before)
    })
  })

  describe('leaving', () => {
    it('hands the host role to an online successor', () => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.New,
          players: {
            host: playerOf('host', { isHost: true }),
            offlinePeer: playerOf('offlinePeer', { status: PlayerStatus.Disconnected }),
            peer: playerOf('peer', { status: PlayerStatus.ReadyToPlay }),
          },
        }),
      )

      room.leave('host')

      expect(room.state.players.peer?.isHost).toBe(true)
      expect(room.state.players.offlinePeer?.isHost).toBe(false)
    })

    it('tells the others', () => {
      const staying = new FakeConnection('game', 'host')
      const room = roomOf(gameInRound({ status: GameStatus.New }), [staying])

      room.leave('peer')

      expect(room.state.players.peer).toBeUndefined()
      expect(staying.sent).toEqual([updateGameAction(room.state)])
    })

    it('shows no state when the last player left', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(
        gameInRound({ status: GameStatus.New, players: { host: playerOf('host', { isHost: true }) }, spectators: { watcher: { id: 'watcher' } } }),
        [watcher],
      )

      room.leave('host')

      expect(room.state.players).toEqual({})
      expect(watcher.sent).toEqual([])
    })

    it('keeps the intermission when one of two players leaves', () => {
      const room = roomOf(gameInRound({ status: GameStatus.RoundFinished }))

      room.leave('host')

      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.players.peer).toBeDefined()
    })

    it.each([GameStatus.InGame, GameStatus.Pause])('abandons a round in %s when a leave drops it below two online players', status => {
      const room = roomOf(gameInRound({ status }))

      room.leave('host')

      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.playground).toEqual(clearedTable)
      expect(room.state.players.peer).toMatchObject({ status: PlayerStatus.DontReadyToPlay, isHost: true })
    })

    it('stops the wait for that user', () => {
      const room = roomOf(gameInRound({ status: GameStatus.New }))
      room.disconnect('peer')

      room.leave('peer')

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('a lost connection', () => {
    it('waits for the user to come back before anything changes', () => {
      const room = roomOf(gameInRound())
      const before = structuredClone(room.state)

      room.disconnect('peer')
      vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS - 1)
      expect(room.state).toEqual(before)

      vi.advanceTimersByTime(1)
      expect(room.state.players.peer?.status).toBe(PlayerStatus.Disconnected)
    })

    it('starts the wait again when the user drops again', () => {
      const room = roomOf(gameInRound())
      room.disconnect('peer')
      vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS - 1)

      room.disconnect('peer')
      vi.advanceTimersByTime(1)

      expect(room.state.players.peer?.status).toBe(PlayerStatus.InGame)
      expect(vi.getTimerCount()).toBe(1)
    })

    it('does not wait for someone who left', () => {
      const room = roomOf(gameInRound({ status: GameStatus.New }))
      room.leave('peer')

      room.disconnect('peer')

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('going offline', () => {
    it('keeps the seat and the board, pauses below two online and shows it', () => {
      const board = gameInRound()
      const staying = new FakeConnection('game', 'host')
      const room = roomOf(board, [staying])

      goOffline(room, 'peer')

      expect({ ...room.state.players.peer, status: PlayerStatus.InGame }).toEqual(board.players.peer)
      expect(room.state.players.peer?.status).toBe(PlayerStatus.Disconnected)
      expect(room.state.status).toBe(GameStatus.Pause)
      expect(staying.sent).toEqual([updateGameAction(room.state)])
    })

    it('removes a spectator', () => {
      const room = roomOf(gameInRound({ spectators: { watcher: { id: 'watcher' } } }))

      goOffline(room, 'watcher')

      expect(room.state.spectators.watcher).toBeUndefined()
    })

    it('changes nothing for someone who is not in the room, or is already offline', () => {
      const room = roomOf(gameInRound({ players: { host: playerOf('host', { status: PlayerStatus.Disconnected }), peer: playerOf('peer') } }))

      const before = structuredClone(room.state)

      goOffline(room, 'stranger')
      goOffline(room, 'host')

      expect(room.state).toEqual(before)
    })
  })

  describe('coming back', () => {
    it.each([PlayerStatus.ReadyToPlay, PlayerStatus.DontReadyToPlay])('comes back not ready between rounds after leaving as %s', status => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.New,
          players: { host: playerOf('host', { isHost: true, status }), peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay }) },
        }),
      )
      goOffline(room, 'host')

      join(room, 'host')

      expect(room.state.players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
    })

    it('comes back not ready during a countdown, and is dealt in when it ends', async () => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.New,
          players: {
            host: playerOf('host', { isHost: true }),
            ghost: playerOf('ghost', { status: PlayerStatus.ReadyToPlay }),
            peer: playerOf('peer'),
          },
        }),
      )
      goOffline(room, 'ghost')
      room.gameplay.startRound('host')

      join(room, 'ghost')
      expect(room.state.players.ghost).toMatchObject({ status: PlayerStatus.DontReadyToPlay, cards: [] })

      await vi.advanceTimersByTimeAsync(4_000)
      expect(room.state.players.ghost?.status).toBe(PlayerStatus.InGame)
      expect(room.state.players.ghost?.cards).toHaveLength(4)
    })

    it('makes a player who was offline when a round was dealt an in-game player when they return during it', async () => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.New,
          players: {
            host: playerOf('host', { isHost: true }),
            ghost: playerOf('ghost', { status: PlayerStatus.ReadyToPlay }),
            peer: playerOf('peer'),
          },
        }),
      )
      goOffline(room, 'ghost')
      room.gameplay.startRound('host')
      await vi.advanceTimersByTimeAsync(4_000)

      join(room, 'ghost')

      expect(room.state.players.ghost?.status).toBe(PlayerStatus.InGame)
    })
  })

  describe('changing roles', () => {
    const intermission = (players: GameState['players'] = { host: playerOf('host', { isHost: true, status: PlayerStatus.DontReadyToPlay }) }) =>
      gameInRound({ status: GameStatus.RoundFinished, players, spectators: { watcher: { id: 'watcher' } } })
    const fullRoster = () =>
      Object.fromEntries(['host', 'a', 'b', 'c'].map(id => [id, playerOf(id, { isHost: id === 'host', status: PlayerStatus.DontReadyToPlay })]))

    it('seats a spectator and shows everyone the whole room', () => {
      const host = new FakeConnection('game', 'host')
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(intermission(), [host, watcher])

      room.becomePlayer('watcher')

      expect(room.state.players.watcher).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
      expect(room.state.spectators).toEqual({})
      expect(host.sent).toEqual([updateGameAction(room.state)])
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
    })

    it('deals the new player a hand in the next round', () => {
      const room = roomOf(intermission())
      room.becomePlayer('watcher')

      room.gameplay.startRound('host')
      vi.advanceTimersByTime(room.state.config.startingDelayInSec * 1_000)

      expect(room.state.players.watcher?.status).toBe(PlayerStatus.InGame)
      expect(room.state.players.watcher?.ligrettoDeck.cards).toHaveLength(10)
    })

    it('answers with the room as it is when the last seat is already taken', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(intermission(fullRoster()), [watcher])
      const before = structuredClone(room.state)

      room.becomePlayer('watcher')

      expect(room.state).toEqual(before)
      expect(watcher.sent).toEqual([updateGameAction(before)])
    })

    it('gives the last seat to the first of two spectators', () => {
      const { host, a, b } = fullRoster()
      const room = roomOf({ ...intermission({ host, a, b }), spectators: { watcher: { id: 'watcher' }, other: { id: 'other' } } })

      room.becomePlayer('watcher')
      room.becomePlayer('other')

      expect(Object.keys(room.state.players)).toHaveLength(4)
      expect(room.state.players.watcher).toBeDefined()
      expect(room.state.spectators).toEqual({ other: { id: 'other' } })
    })

    it('lets a player who is not the host watch instead, and frees the seat', () => {
      const host = new FakeConnection('game', 'host')
      const room = roomOf(intermission({ ...intermission().players, peer: playerOf('peer', { status: PlayerStatus.ReadyToPlay }) }), [host])

      room.becomeSpectator('peer')

      expect(room.state.players.peer).toBeUndefined()
      expect(room.state.spectators.peer).toEqual({ id: 'peer' })
      expect(host.sent).toEqual([updateGameAction(room.state)])
    })

    it('keeps the host seated and answers with the room', () => {
      const host = new FakeConnection('game', 'host')
      const room = roomOf(intermission(), [host])
      const before = structuredClone(room.state)

      room.becomeSpectator('host')

      expect(room.state).toEqual(before)
      expect(host.sent).toEqual([updateGameAction(before)])
    })

    it('keeps the table of the last round for someone joining after a change', () => {
      const room = new Room(intermission({ ...intermission().players, peer: playerOf('peer') }), {
        broadcast: broadcastTo(connections),
        results: { host: { roundScore: 2, gameScore: 2 }, peer: { roundScore: 1, gameScore: 5 } },
      })
      room.becomeSpectator('peer')

      const newcomer = join(room, 'newcomer')

      expect(newcomer.sentOfType(endRoundAction)).toEqual([
        endRoundAction({ host: { roundScore: 2, gameScore: 2 }, peer: { roundScore: 1, gameScore: 5 } }),
      ])
    })

    it.each([GameStatus.Starting, GameStatus.InGame, GameStatus.Pause])('changes nothing during a round and answers with the room (%s)', status => {
      const connection = new FakeConnection('game', 'host')
      const room = roomOf(
        gameInRound({
          status,
          players: { host: playerOf('host', { isHost: true }), peer: playerOf('peer') },
          spectators: { watcher: { id: 'watcher' } },
        }),
        [connection],
      )
      const before = structuredClone(room.state)

      room.becomePlayer('watcher')
      room.becomeSpectator('peer')

      expect(room.state).toEqual(before)
      expect(connection.sent).toEqual([updateGameAction(before), updateGameAction(before)])
    })

    it('answers during the countdown with the roster and host as they are now, after the host left', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(intermission({ ...intermission().players, peer: playerOf('peer'), alpha: playerOf('alpha') }), [watcher])
      room.gameplay.startRound('host')
      room.leave('host')
      watcher.sent = []

      room.becomePlayer('watcher')

      expect(room.state.status).toBe(GameStatus.Starting)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(Object.keys(room.state.players).sort()).toEqual(['alpha', 'peer'])
      expect(room.state.players.peer?.isHost).toBe(true)
      expect(room.state.spectators).toEqual({ watcher: { id: 'watcher' } })
    })

    it('hands the host role to a spectator seated while every player is offline, who can then start a round', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(
        {
          ...intermission({ host: playerOf('host', { isHost: true, status: PlayerStatus.Disconnected }) }),
          spectators: { watcher: { id: 'watcher' }, other: { id: 'other' } },
        },
        [watcher],
      )

      room.becomePlayer('watcher')
      room.becomePlayer('other')

      expect(room.state.players.watcher?.isHost).toBe(true)
      expect(room.state.players.other?.isHost).toBe(false)
      expect(room.state.players.host?.isHost).toBe(false)
      expect(watcher.sent.at(-1)).toEqual(updateGameAction(room.state))

      room.gameplay.startRound('watcher')
      vi.advanceTimersByTime(room.state.config.startingDelayInSec * 1_000)

      expect(room.state.status).toBe(GameStatus.InGame)
    })
  })

  describe('the host role', () => {
    const threePlayers = () =>
      gameInRound({ players: { host: playerOf('host', { isHost: true }), peer: playerOf('peer'), alpha: playerOf('alpha') } })

    it('goes to the first online player by id when the host goes offline, and everyone sees it', () => {
      const staying = new FakeConnection('game', 'peer')
      const room = roomOf(threePlayers(), [staying])

      goOffline(room, 'host')

      expect(room.state.players.alpha?.isHost).toBe(true)
      expect(room.state.players.peer?.isHost).toBe(false)
      expect(room.state.players.host?.isHost).toBe(false)
      expect(staying.sent).toEqual([updateGameAction(room.state)])
    })

    it('stays during the grace period', () => {
      const room = roomOf(threePlayers())

      room.disconnect('host')
      vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS - 1)

      expect(room.state.players.host?.isHost).toBe(true)
    })

    it('stays when someone else goes offline', () => {
      const room = roomOf(threePlayers())

      goOffline(room, 'peer')

      expect(room.state.players.host?.isHost).toBe(true)
    })

    it('does not come back with the former host', () => {
      const room = roomOf(threePlayers())
      goOffline(room, 'host')

      join(room, 'host')

      expect(room.state.players.host?.isHost).toBe(false)
      expect(room.state.players.alpha?.isHost).toBe(true)
    })

    it('stays with the host when nobody is online to take it, until the first player back', () => {
      const room = roomOf(gameInRound())
      goOffline(room, 'peer')
      goOffline(room, 'host')
      expect(room.state.players.host?.isHost).toBe(true)

      join(room, 'peer')

      expect(room.state.players.peer?.isHost).toBe(true)
      expect(room.state.players.host?.isHost).toBe(false)
    })

    it('goes to a newcomer when nobody is online', () => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.New,
          players: { host: playerOf('host', { isHost: true, status: PlayerStatus.Disconnected }) },
        }),
      )

      join(room, 'newcomer')

      expect(room.state.players.newcomer?.isHost).toBe(true)
      expect(room.state.players.host?.isHost).toBe(false)
    })

    it('stays with a host who comes back first', () => {
      const room = roomOf(gameInRound())
      goOffline(room, 'peer')
      goOffline(room, 'host')

      join(room, 'host')

      expect(room.state.players.host?.isHost).toBe(true)
    })
  })

  describe('during the countdown', () => {
    const emptyHand = {
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: { isHidden: true, cards: [] },
      stackDeck: { isHidden: true, cards: [] },
    }
    /** Online players with readiness of their own, a watcher, and a countdown long enough to outlast the grace period. */
    const counting = (...extraPlayers: string[]) => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.RoundFinished,
          players: {
            host: playerOf('host', { isHost: true, status: PlayerStatus.ReadyToPlay, cards: [card] }),
            peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay, cards: [card] }),
            ...Object.fromEntries(extraPlayers.map(id => [id, playerOf(id, { status: PlayerStatus.ReadyToPlay, cards: [card] })])),
          },
          spectators: { watcher: { id: 'watcher' } },
          config: { playersMaxCount: 4, startingDelayInSec: 60, maxCardsOnTable: 12 },
        }),
        [new FakeConnection('game', 'host'), new FakeConnection('game', 'peer'), new FakeConnection('game', 'watcher')],
      )
      room.gameplay.startRound('host')
      for (const connection of connections) {
        connection.sent = []
      }
      return room
    }
    /** Every snapshot anybody was sent, as connections or as updates. */
    const snapshots = () =>
      connections.flatMap(connection =>
        connection.sent.flatMap(({ type, payload }) =>
          type === updateGameAction.type
            ? [payload as GameState]
            : type === connectToRoomSuccessAction.type
              ? [(payload as { game: GameState }).game]
              : [],
        ),
      )
    const expectNothingDealt = (game: GameState) => {
      expect(game.status).toBe(GameStatus.Starting)
      expect(game.playground).toEqual(clearedTable)
      for (const player of Object.values(game.players)) {
        expect(player).toMatchObject(emptyHand)
      }
    }

    it('seats a newcomer as a spectator, with seats free, and shows them the countdown', () => {
      const room = counting()

      const newcomer = join(room, 'newcomer')

      expect(room.state.spectators).toEqual({ watcher: { id: 'watcher' }, newcomer: { id: 'newcomer' } })
      expect(newcomer.sent).toEqual([connectToRoomSuccessAction({ game: room.state }), updateGameAction(room.state)])
      expect(snapshots().length).toBeGreaterThan(0)
      snapshots().forEach(expectNothingDealt)
      expect(room.state.players.host).toMatchObject({ isHost: true, status: PlayerStatus.ReadyToPlay })
      expect(room.state.players.peer).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
    })

    it('shows a player connecting again within the grace period the countdown, with their status kept', () => {
      const room = counting()
      room.disconnect('peer')

      const again = join(room, 'peer')

      expect(again.sent[0]).toEqual(connectToRoomSuccessAction({ game: room.state }))
      snapshots().forEach(expectNothingDealt)
      expect(room.state.players.peer?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(vi.getTimerCount()).toBe(1)
    })

    it('shows a player coming back after the grace period the countdown, not ready', () => {
      const room = counting('third')
      goOffline(room, 'third')

      join(room, 'third')

      expect(snapshots().length).toBeGreaterThan(1)
      snapshots().forEach(expectNothingDealt)
      expect(room.state.players.third?.status).toBe(PlayerStatus.DontReadyToPlay)
    })

    it('shows a host leaving, with the role passed on and the countdown kept', () => {
      const room = counting('third')

      room.leave('host')

      expect(snapshots().length).toBeGreaterThan(0)
      snapshots().forEach(expectNothingDealt)
      expect(room.state.players.peer).toMatchObject({ isHost: true, status: PlayerStatus.DontReadyToPlay })
      expect(room.state.players.third).toMatchObject({ isHost: false, status: PlayerStatus.ReadyToPlay })
    })

    it('shows a host going offline, with the role passed on and the countdown kept', () => {
      const room = counting('third')

      goOffline(room, 'host')

      expect(snapshots().length).toBeGreaterThan(0)
      snapshots().forEach(expectNothingDealt)
      expect(room.state.players.host).toMatchObject({ isHost: false, status: PlayerStatus.Disconnected })
      expect(room.state.players.peer?.isHost).toBe(true)
    })

    it('shows a spectator going away', () => {
      const room = counting()

      goOffline(room, 'watcher')

      expect(room.state.spectators).toEqual({})
      expect(snapshots().length).toBeGreaterThan(0)
      snapshots().forEach(expectNothingDealt)
    })

    it('shows a refused readiness to nobody and changes nothing', () => {
      const room = counting()
      const before = structuredClone(room.state)

      room.setReadiness('peer', PlayerStatus.ReadyToPlay)

      expect(room.state).toEqual(before)
      expect(snapshots()).toEqual([])
    })

    it('shows a round given up with nothing dealt, and lets it start again', async () => {
      const room = counting()

      room.leave('peer')
      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.players.host).toMatchObject({ isHost: true, status: PlayerStatus.DontReadyToPlay, ...emptyHand })

      join(room, 'peer')
      room.gameplay.startRound('host')
      expect(room.state.status).toBe(GameStatus.Starting)
      await vi.advanceTimersByTimeAsync(60_000)

      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.peer?.cards).toHaveLength(5)
    })
  })

  describe('closing', () => {
    it('clears every timer of the room and tells whoever is still there', () => {
      const watcher = new FakeConnection('game', 'watcher')
      const room = roomOf(gameInRound(), [watcher])
      room.disconnect('peer')

      room.close()

      expect(vi.getTimerCount()).toBe(0)
      expect(watcher.sent).toEqual([connectToRoomErrorAction()])
    })
  })
})
