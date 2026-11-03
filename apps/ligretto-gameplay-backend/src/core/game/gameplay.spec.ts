import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, updateGameAction, type Game as GameState, type Player } from '@memebattle/ligretto-shared'
import { DISCONNECT_GRACE_PERIOD_MS, Room } from './room'
import { FakeConnection } from '../ports.fake'
import { gameInRound, playerOf } from './ports.fake'

const clearedTable = { decks: new Array(12).fill(null), droppedDecks: [] }

describe('Gameplay', () => {
  /** Someone watching the room, to see what it shows. */
  let watcher: FakeConnection

  const roomOf = (state: GameState) =>
    new Room(structuredClone(state), {
      broadcast: action => watcher.send(action),
    })
  const join = (room: Room, userId: string) => room.join(userId, new FakeConnection(room.id, userId))

  beforeEach(() => {
    vi.useFakeTimers()
    watcher = new FakeConnection('game', 'watcher')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('starting a round', () => {
    const between = (status = GameStatus.New) =>
      gameInRound({
        status,
        players: {
          host: playerOf('host', { isHost: true, status: PlayerStatus.DontReadyToPlay }),
          peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay }),
        },
      })

    it('shows Starting and deals at once', () => {
      const room = roomOf(between())

      room.gameplay.startRound('host')

      expect(watcher.sent).toHaveLength(1)
      expect((watcher.sent[0].payload as GameState).status).toBe(GameStatus.Starting)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host).toMatchObject({ status: PlayerStatus.InGame })
      expect(room.state.players.host?.cards).toHaveLength(5)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
      expect(room.state.players.host?.stackDeck.cards).toHaveLength(25)
      expect(room.state.playground).toEqual(clearedTable)
    })

    it('shows the deal when the countdown ends', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')
      watcher.sent = []

      await vi.advanceTimersByTimeAsync(3_999)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
    })

    it('shows no deal for a round that ended during the countdown', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.leave('host')
      watcher.sent = []
      await vi.advanceTimersByTimeAsync(4_000)

      expect(watcher.sent).toEqual([])
    })

    it('shows the deal of a new round on its own countdown, not on the one it replaced', async () => {
      const room = roomOf(between(GameStatus.RoundFinished))
      room.gameplay.startRound('host')
      vi.advanceTimersByTime(3_000)
      room.leave('peer')
      join(room, 'peer')
      room.gameplay.startRound('host')
      watcher.sent = []

      await vi.advanceTimersByTimeAsync(3_999)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
    })

    it('shows no deal for a room closed during the countdown', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.close()
      watcher.sent = []
      await vi.advanceTimersByTimeAsync(4_000)

      expect(watcher.sent).toEqual([])
    })

    it('starts the next round from a finished round', () => {
      const room = roomOf(between(GameStatus.RoundFinished))

      room.gameplay.startRound('host')

      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
    })

    it('keeps a disconnected player disconnected through the deal, with a hand to return to', () => {
      const ghost = playerOf('ghost', { status: PlayerStatus.Disconnected })
      const room = roomOf({ ...between(), players: { ...between().players, ghost } })

      room.gameplay.startRound('host')

      expect(room.state.players.ghost?.status).toBe(PlayerStatus.Disconnected)
      expect(room.state.players.ghost?.ligrettoDeck.cards).toHaveLength(10)
    })

    it.each([
      ['a player who is not the host', 'peer', GameStatus.New, PlayerStatus.DontReadyToPlay],
      ['a paused game', 'host', GameStatus.Pause, PlayerStatus.DontReadyToPlay],
      ['fewer than two online players', 'host', GameStatus.New, PlayerStatus.Disconnected],
    ])('refuses %s', (_label, userId, status, peerStatus) => {
      const room = roomOf({ ...between(status), players: { ...between().players, peer: playerOf('peer', { status: peerStatus }) } })
      const before = structuredClone(room.state)

      room.gameplay.startRound(userId)

      expect(room.state).toEqual(before)
      expect(watcher.sent).toEqual([])
    })

    it('pauses when a player goes offline during the countdown', () => {
      const room = roomOf({ ...between(), config: { playersMaxCount: 4, startingDelayInSec: 60, maxCardsOnTable: 12 } })
      room.gameplay.startRound('host')

      room.disconnect('peer')
      vi.advanceTimersByTime(DISCONNECT_GRACE_PERIOD_MS)

      expect(room.state.status).toBe(GameStatus.Pause)
    })
  })

  describe('the countdown', () => {
    const between = () =>
      gameInRound({
        status: GameStatus.New,
        players: {
          host: playerOf('host', { isHost: true, status: PlayerStatus.DontReadyToPlay }),
          peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay }),
        },
      })

    it('leaves no timer once the deal is shown', () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      vi.advanceTimersByTime(4_000)

      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops with a room that closes', () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.close()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('resuming', () => {
    it('resumes a paused game without changing its round', () => {
      const room = roomOf(gameInRound({ status: GameStatus.Pause }))
      const expected = { ...room.state, status: GameStatus.InGame }

      room.gameplay.resumeRound('host')

      expect(room.state).toEqual(expected)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
    })

    it('does not let anyone else resume', () => {
      const room = roomOf(gameInRound({ status: GameStatus.Pause }))

      room.gameplay.resumeRound('peer')

      expect(room.state.status).toBe(GameStatus.Pause)
      expect(watcher.sent).toEqual([])
    })

    it('does not resume until two players are online', () => {
      const room = roomOf(
        gameInRound({
          status: GameStatus.Pause,
          players: { host: playerOf('host', { isHost: true }), peer: playerOf('peer', { status: PlayerStatus.Disconnected }) },
        }),
      )

      room.gameplay.resumeRound('host')

      expect(room.state.status).toBe(GameStatus.Pause)
      expect(watcher.sent).toEqual([])
    })

    it('does not change a game that is not paused', () => {
      const room = roomOf(gameInRound({ status: GameStatus.New }))

      room.gameplay.resumeRound('host')

      expect(room.state.status).toBe(GameStatus.New)
    })
  })

  describe('moves', () => {
    const card = { color: CardColors.red, value: 1, playerId: 'host' }
    const withHost = (overrides: Partial<Player>) =>
      gameInRound({ players: { host: playerOf('host', { isHost: true, ...overrides }), peer: playerOf('peer') } })

    it('moves a card to the table', () => {
      const room = roomOf(withHost({ cards: [card] }))

      room.gameplay.putCard('host', 0, 3)

      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.players.host?.cards).toEqual([null])
      expect(room.state.playground.decks[3]).toEqual({ cards: [card], isHidden: false })
    })

    it('shows a refused placement too, because the client mirrored it optimistically', () => {
      const room = roomOf(withHost({ cards: [{ ...card, value: 7 }] }))
      const before = structuredClone(room.state)

      room.gameplay.putCard('host', 0, 3)

      expect(room.state).toEqual(before)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
    })

    it('drops a completed deck from the table', () => {
      const ten = { ...card, value: 10 }
      const nine = { ...card, value: 9 }
      const room = roomOf({ ...withHost({ cards: [ten] }), playground: { decks: [{ isHidden: false, cards: [nine] }, null], droppedDecks: [] } })

      room.gameplay.putCard('host', 0, 0)

      expect(room.state.playground).toEqual({ decks: [null, null], droppedDecks: [{ isHidden: false, cards: [nine, ten] }] })
    })

    it('moves the top of the open stack to the table', () => {
      const room = roomOf(withHost({ stackOpenDeck: { isHidden: false, cards: [{ ...card, value: 5 }, card] } }))

      room.gameplay.putCardFromStack('host', 0)

      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.players.host?.stackOpenDeck.cards).toEqual([{ ...card, value: 5 }])
      expect(room.state.playground.decks[0]?.cards).toEqual([card])
    })

    it('opens three cards from the stack', () => {
      const stack = [1, 2, 3, 4].map(value => ({ ...card, value }))
      const room = roomOf(withHost({ stackDeck: { isHidden: true, cards: stack } }))

      room.gameplay.takeFromStack('host')

      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.players.host?.stackDeck).toEqual({ isHidden: true, cards: stack.slice(0, 1) })
      expect(room.state.players.host?.stackOpenDeck.cards).toEqual(stack.slice(1))
    })

    it('turns the open stack over when the stack is empty', () => {
      const open = [1, 2, 3, 4].map(value => ({ ...card, value }))
      const room = roomOf(withHost({ stackOpenDeck: { isHidden: false, cards: open } }))

      room.gameplay.takeFromStack('host')

      expect(room.state.players.host?.stackDeck.cards).toHaveLength(1)
      expect(room.state.players.host?.stackOpenDeck.cards).toHaveLength(3)
    })

    it('fills an empty slot from the ligretto deck', () => {
      const deck = [
        { ...card, value: 2 },
        { ...card, value: 3 },
      ]
      const room = roomOf(withHost({ cards: [null], ligrettoDeck: { isHidden: true, cards: deck } }))

      room.gameplay.takeFromLigretto('host')

      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.players.host?.cards).toEqual([deck[1]])
      expect(room.state.players.host?.ligrettoDeck.cards).toEqual([deck[0]])
      expect(room.state.status).toBe(GameStatus.InGame)
    })

    it.each([
      ['while paused', 'host', GameStatus.Pause, PlayerStatus.InGame],
      ['from a disconnected player', 'host', GameStatus.InGame, PlayerStatus.Disconnected],
      ['from a spectator', 'watcher', GameStatus.InGame, PlayerStatus.InGame],
    ])('refuses a move %s', (_label, userId, status, hostStatus) => {
      const room = roomOf({ ...withHost({ status: hostStatus, cards: [card] }), status, spectators: { watcher: { id: 'watcher' } } })
      const before = structuredClone(room.state)

      room.gameplay.putCard(userId, 0, 0)
      room.gameplay.putCardFromStack(userId, 0)
      room.gameplay.takeFromStack(userId)
      room.gameplay.takeFromLigretto(userId)

      expect(room.state).toEqual(before)
      expect(watcher.sent).toEqual([])
    })
  })

  describe('finishing a round', () => {
    const finishing = () =>
      gameInRound({
        players: {
          host: playerOf('host', {
            isHost: true,
            cards: [null],
            ligrettoDeck: { isHidden: true, cards: [{ color: CardColors.blue, value: 7, playerId: 'host' }] },
          }),
          peer: playerOf('peer', { ligrettoDeck: { isHidden: true, cards: [{ color: CardColors.red, value: 1, playerId: 'peer' }] } }),
        },
      })
    const claimed = () => {
      const room = roomOf(finishing())
      room.gameplay.takeFromLigretto('host')
      return room
    }

    it('closes the round at once, shows it and reports its scores with a fresh id', () => {
      const room = roomOf(finishing())

      const round = room.gameplay.takeFromLigretto('host')

      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.playground).toEqual(clearedTable)
      expect(room.state.players.host?.status).toBe(PlayerStatus.DontReadyToPlay)
      expect(round?.roundId).toMatch(/^[0-9a-f-]{36}$/)
      expect(round?.results).toEqual([
        { playerId: 'host', score: 0 },
        { playerId: 'peer', score: -2 },
      ])
    })

    it('scores the table as it was before clearing it', () => {
      const dropped = { color: CardColors.green, value: 1, playerId: 'host' }
      const room = roomOf({
        ...finishing(),
        playground: { decks: [{ isHidden: false, cards: [dropped] }, ...new Array(11).fill(null)], droppedDecks: [] },
      })

      const round = room.gameplay.takeFromLigretto('host')

      expect(round?.results[0]).toEqual({ playerId: 'host', score: 1 })
    })

    it('mints a new round id for every round', () => {
      const first = roomOf(finishing()).gameplay.takeFromLigretto('host')
      const second = roomOf(finishing()).gameplay.takeFromLigretto('host')

      expect(second?.roundId).not.toBe(first?.roundId)
    })

    it('keeps a Disconnected player Disconnected', () => {
      const room = roomOf({ ...finishing(), players: { ...finishing().players, ghost: playerOf('ghost', { status: PlayerStatus.Disconnected }) } })

      room.gameplay.takeFromLigretto('host')

      expect(room.state.players.ghost?.status).toBe(PlayerStatus.Disconnected)
      expect(room.state.players.peer?.status).toBe(PlayerStatus.DontReadyToPlay)
    })

    it('does nothing for a round that is already finished', () => {
      const room = roomOf({ ...finishing(), status: GameStatus.RoundFinished })

      expect(room.gameplay.takeFromLigretto('host')).toBeUndefined()
    })

    it('lets the next round start straight away', () => {
      const room = claimed()

      room.gameplay.startRound('host')

      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
    })
  })
})
