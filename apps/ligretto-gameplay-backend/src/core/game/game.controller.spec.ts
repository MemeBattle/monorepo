import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  becomePlayerEmitAction,
  becomeSpectatorEmitAction,
  CardColors,
  GameStatus,
  kickedFromRoomAction,
  kickFromRoomEmitAction,
  leaveFromRoomEmitAction,
  PlayerStatus,
  putCardAction,
  putCardFromStackOpenDeck,
  resumeGameEmitAction,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
  updateGameAction,
  type Game as GameState,
} from '@memebattle/ligretto-shared'
import { Room } from './room'
import { handleAction } from './game.controller'
import { FakeConnection } from '../ports.fake'
import { broadcastTo, gameInRound, playerOf, sendToUserOf } from './ports.fake'

const card = { color: CardColors.red, value: 1, playerId: 'host' }

describe('the game controller', () => {
  let connections: FakeConnection[]
  let room: Room

  const open = (userId: string) => {
    const connection = new FakeConnection(room.id, userId)
    connections.push(connection)
    return connection
  }
  const seed = (state: GameState) => {
    room = new Room(structuredClone(state), {
      broadcast: broadcastTo(connections),
      sendTo: sendToUserOf(connections),
    })
  }
  const send = (connection: FakeConnection, action: { type: string; payload?: unknown }) => handleAction({ room, userId: connection.userId }, action)

  beforeEach(() => {
    vi.useFakeTimers()
    connections = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('an accepted action', () => {
    const between = () =>
      gameInRound({
        status: GameStatus.New,
        players: {
          host: playerOf('host', { isHost: true, status: PlayerStatus.DontReadyToPlay }),
          peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay }),
        },
      })

    it('announces Starting, not the deal, when a round starts', () => {
      seed(between())
      const peer = open('peer')

      send(open('host'), startGameEmitAction({ gameId: 'game' }))

      expect(peer.sent).toHaveLength(1)
      expect((peer.sent[0].payload as GameState).status).toBe(GameStatus.Starting)
      expect(room.state.status).toBe(GameStatus.Starting)
    })

    it.each([
      ['a resume', () => gameInRound({ status: GameStatus.Pause }), 'host', resumeGameEmitAction({ gameId: 'game' })],
      ['readiness', between, 'host', setPlayerStatusEmitAction({ gameId: 'game', status: PlayerStatus.ReadyToPlay })],
      [
        'a spectator taking a seat',
        () => ({ ...between(), spectators: { watcher: { id: 'watcher' } } }),
        'watcher',
        becomePlayerEmitAction({ gameId: 'game' }),
      ],
      ['a player who starts watching', between, 'peer', becomeSpectatorEmitAction({ gameId: 'game' })],
      ['a stack take', gameInRound, 'host', takeFromStackDeckAction({ gameId: 'game' })],
      [
        'a ligretto take',
        () =>
          gameInRound({
            players: {
              host: playerOf('host', { isHost: true, cards: [null], ligrettoDeck: { isHidden: true, cards: [card, card] } }),
              peer: playerOf('peer'),
            },
          }),
        'host',
        takeFromLigrettoDeckAction({ gameId: 'game' }),
      ],
      [
        'a placement',
        () => gameInRound({ players: { host: playerOf('host', { isHost: true, cards: [card] }), peer: playerOf('peer') } }),
        'host',
        putCardAction({ gameId: 'game', cardIndex: 0, playgroundDeckIndex: 3 }),
      ],
      [
        'a placement from the open stack',
        () =>
          gameInRound({
            players: { host: playerOf('host', { isHost: true, stackOpenDeck: { isHidden: false, cards: [card] } }), peer: playerOf('peer') },
          }),
        'host',
        putCardFromStackOpenDeck({ gameId: 'game', playgroundDeckIndex: 0 }),
      ],
    ])('broadcasts the state after %s', (_label, state, userId, action) => {
      seed(state())
      const peer = open('peer')
      const sender = open(userId)

      send(sender, action)

      expect(peer.sent).toEqual([updateGameAction(room.state)])
      expect(sender.sent).toEqual([updateGameAction(room.state)])
    })

    it('answers a refused placement with the state, because the client mirrored it optimistically', () => {
      seed(gameInRound({ players: { host: playerOf('host', { isHost: true, cards: [{ ...card, value: 7 }] }), peer: playerOf('peer') } }))
      const connection = open('host')

      send(connection, putCardAction({ gameId: 'game', cardIndex: 0, playgroundDeckIndex: 3 }))

      expect(connection.sent).toEqual([updateGameAction(room.state)])
    })

    it('shows the closed round on the last ligretto card', () => {
      seed(
        gameInRound({
          players: {
            host: playerOf('host', { isHost: true, cards: [null], ligrettoDeck: { isHidden: true, cards: [card] } }),
            peer: playerOf('peer'),
          },
        }),
      )
      const connection = open('host')

      const round = send(connection, takeFromLigrettoDeckAction({ gameId: 'game' }))

      expect(connection.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(round).toMatchObject({ results: [{ playerId: 'host' }, { playerId: 'peer' }] })
    })
  })

  describe('a refused or stale action', () => {
    it('sends nothing when the game refuses', () => {
      seed(gameInRound({ status: GameStatus.Pause }))
      const connection = open('host')

      send(connection, putCardAction({ gameId: 'game', cardIndex: 0, playgroundDeckIndex: 0 }))
      send(connection, startGameEmitAction({ gameId: 'game' }))

      expect(connection.sent).toEqual([])
    })

    it('ignores a message naming another room', () => {
      seed(gameInRound({ players: { host: playerOf('host', { isHost: true, cards: [card] }), peer: playerOf('peer') } }))
      const connection = open('host')
      const before = structuredClone(room.state)

      send(connection, putCardAction({ gameId: 'other-room', cardIndex: 0, playgroundDeckIndex: 0 }))

      expect(room.state).toEqual(before)
      expect(connection.sent).toEqual([])
    })

    it('changes the role of the connection only, whoever the payload names', () => {
      seed(
        gameInRound({
          status: GameStatus.New,
          players: { host: playerOf('host', { isHost: true }), peer: playerOf('peer') },
          spectators: { watcher: { id: 'watcher' } },
        }),
      )

      send(open('host'), becomeSpectatorEmitAction({ gameId: 'game', userId: 'peer' } as never))

      expect(room.state.players.peer).toBeDefined()
      expect(room.state.players.host?.isHost).toBe(true)
      expect(room.state.spectators).toEqual({ watcher: { id: 'watcher' } })
    })

    it('ignores a malformed message without losing the game', () => {
      seed(gameInRound())

      send(open('host'), { type: putCardAction.type })

      expect(room.state.status).toBe(GameStatus.InGame)
    })

    it('ignores an action named after an Object member', () => {
      seed(gameInRound())

      expect(() => send(open('host'), { type: 'constructor' })).not.toThrow()
    })
  })

  describe('a kick', () => {
    const between = () => gameInRound({ status: GameStatus.RoundFinished })

    it('takes the target out of the room when the connection belongs to the host', () => {
      seed(between())
      const target = open('peer')

      send(open('host'), kickFromRoomEmitAction({ gameId: 'game', userId: 'peer' }))

      expect(room.hasParticipant('peer')).toBe(false)
      expect(target.sent).toEqual([kickedFromRoomAction({ roomUuid: 'game' })])
    })

    it('acts as the user of the connection, whoever the payload names', () => {
      seed(between())

      send(open('peer'), { type: kickFromRoomEmitAction.type, payload: { gameId: 'game', userId: 'host', hostId: 'host' } })

      expect(room.hasParticipant('host')).toBe(true)
    })

    it('ignores a kick naming another room', () => {
      seed(between())

      send(open('host'), kickFromRoomEmitAction({ gameId: 'other-room', userId: 'peer' }))

      expect(room.hasParticipant('peer')).toBe(true)
    })

    it.each([
      ['no payload', undefined],
      ['no target', { gameId: 'game' }],
      ['a target that is not an id', { gameId: 'game', userId: ['peer'] }],
    ])('ignores a kick with %s', (_label, payload) => {
      seed(between())
      const before = structuredClone(room.state)

      send(open('host'), { type: kickFromRoomEmitAction.type, payload })

      expect(room.state).toEqual(before)
    })
  })

  it('takes the user out of the room on a leave', () => {
    seed(gameInRound({ status: GameStatus.New }))
    const staying = open('host')

    send(open('peer'), leaveFromRoomEmitAction())

    expect(room.state.players.peer).toBeUndefined()
    expect(staying.sent).toEqual([updateGameAction(room.state)])
  })
})
