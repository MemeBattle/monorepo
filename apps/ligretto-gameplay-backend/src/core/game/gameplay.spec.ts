import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, updateGameAction, type Game as GameState, type Player } from '@memebattle/ligretto-shared'
import { DISCONNECT_GRACE_PERIOD_MS, Room } from './room'
import { FakeConnection } from '../ports.fake'
import { gameInRound, playerOf } from './ports.fake'

const clearedTable = { decks: new Array(12).fill(null), droppedDecks: [] }
const emptyHand = {
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: true, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
}
const card = { color: CardColors.red, value: 1, playerId: 'host' }

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
          host: playerOf('host', { isHost: true, status: PlayerStatus.ReadyToPlay }),
          peer: playerOf('peer', { status: PlayerStatus.DontReadyToPlay }),
        },
      })
    const withLongCountdown = (state: GameState): GameState => ({ ...state, config: { ...state.config, startingDelayInSec: 60 } })
    const updatesSent = () => watcher.sentOfType(updateGameAction).map(({ payload }) => payload as GameState)

    it('shows Starting with nothing dealt, and keeps it until the countdown ends', async () => {
      const room = roomOf(between())

      room.gameplay.startRound('host')

      const starting = {
        ...between(),
        status: GameStatus.Starting,
        players: { host: { ...between().players.host!, ...emptyHand }, peer: { ...between().players.peer!, ...emptyHand } },
        playground: clearedTable,
      }
      expect(room.state).toEqual(starting)
      expect(watcher.sent).toEqual([updateGameAction(starting)])

      await vi.advanceTimersByTimeAsync(3_999)
      expect(room.state).toEqual(starting)
      expect(watcher.sent).toHaveLength(1)
    })

    it('deals when the countdown ends, and shows the deal once', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')
      watcher.sent = []

      await vi.advanceTimersByTimeAsync(4_000)

      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host).toMatchObject({ status: PlayerStatus.InGame })
      expect(room.state.players.host?.cards).toHaveLength(5)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
      expect(room.state.players.host?.stackDeck.cards).toHaveLength(25)
      expect(room.state.playground).toEqual(clearedTable)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])

      await vi.advanceTimersByTimeAsync(60_000)
      expect(watcher.sent).toHaveLength(1)
    })

    it('hides the hands of the finished round during the countdown of the next', async () => {
      const leftover = playerOf('host', {
        isHost: true,
        status: PlayerStatus.DontReadyToPlay,
        cards: [card],
        ligrettoDeck: { isHidden: true, cards: [card] },
      })
      const room = roomOf({ ...between(GameStatus.RoundFinished), players: { ...between().players, host: leftover } })

      room.gameplay.startRound('host')

      expect(room.state.status).toBe(GameStatus.Starting)
      expect(room.state.players.host).toEqual({ ...leftover, ...emptyHand })

      await vi.advanceTimersByTimeAsync(4_000)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
    })

    it('deals to the players seated when the countdown ends, sized for how many they are', async () => {
      const room = roomOf({ ...between(), players: { ...between().players, third: playerOf('third', { status: PlayerStatus.DontReadyToPlay }) } })
      room.gameplay.startRound('host')

      room.leave('third')
      join(room, 'newcomer')
      await vi.advanceTimersByTimeAsync(4_000)

      expect(Object.keys(room.state.players)).toEqual(['host', 'peer'])
      expect(room.state.spectators).toEqual({ newcomer: { id: 'newcomer' } })
      expect(room.state.players.host?.cards).toHaveLength(5)
      expect(room.state.players.peer?.cards).toHaveLength(5)
    })

    it('keeps a disconnected player disconnected through the deal, with a hand to return to', async () => {
      const ghost = playerOf('ghost', { status: PlayerStatus.Disconnected })
      const room = roomOf({ ...between(), players: { ...between().players, ghost } })

      room.gameplay.startRound('host')
      expect(room.state.players.ghost).toEqual({ ...ghost, ...emptyHand })

      await vi.advanceTimersByTimeAsync(4_000)
      expect(room.state.players.ghost?.status).toBe(PlayerStatus.Disconnected)
      expect(room.state.players.ghost?.ligrettoDeck.cards).toHaveLength(10)
    })

    it('counts a player within the grace period as online, and deals them in', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.disconnect('peer')
      await vi.advanceTimersByTimeAsync(4_000)

      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.peer?.ligrettoDeck.cards).toHaveLength(10)
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
      expect(vi.getTimerCount()).toBe(0)
    })

    it('refuses every move, readiness, resume and another start during the countdown, and deals on time', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')
      watcher.sent = []
      const starting = structuredClone(room.state)
      await vi.advanceTimersByTimeAsync(2_000)

      for (const userId of ['host', 'peer']) {
        room.gameplay.putCard(userId, 0, 0)
        room.gameplay.putCardFromStack(userId, 0)
        room.gameplay.takeFromStack(userId)
        expect(room.gameplay.takeFromLigretto(userId)).toBeUndefined()
        room.setReadiness(userId, PlayerStatus.ReadyToPlay)
        room.gameplay.resumeRound(userId)
        room.gameplay.startRound(userId)
      }

      expect(room.state).toEqual(starting)
      expect(watcher.sent).toEqual([])
      expect(vi.getTimerCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(2_000)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(updatesSent().map(({ status }) => status)).toEqual([GameStatus.InGame])
    })

    it('gives up the round when a player goes offline and fewer than two are online, and never deals it', async () => {
      const room = roomOf(withLongCountdown(between()))
      room.gameplay.startRound('host')

      room.disconnect('peer')
      await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)

      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.players.host).toMatchObject({ status: PlayerStatus.DontReadyToPlay, cards: [] })
      expect(room.state.players.peer).toMatchObject({ status: PlayerStatus.Disconnected, cards: [] })

      watcher.sent = []
      await vi.advanceTimersByTimeAsync(60_000)
      room.gameplay.resumeRound('host')
      expect(watcher.sent).toEqual([])
      expect(room.state.status).toBe(GameStatus.RoundFinished)
    })

    it('keeps counting down when one of three goes offline, and deals them in', async () => {
      const room = roomOf(
        withLongCountdown({ ...between(), players: { ...between().players, third: playerOf('third', { status: PlayerStatus.DontReadyToPlay }) } }),
      )
      room.gameplay.startRound('host')

      room.disconnect('third')
      await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_PERIOD_MS)
      expect(room.state.status).toBe(GameStatus.Starting)
      expect(room.state.players.third).toMatchObject({ status: PlayerStatus.Disconnected, cards: [] })

      await vi.advanceTimersByTimeAsync(60_000)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.third?.status).toBe(PlayerStatus.Disconnected)
      expect(room.state.players.third?.cards).toHaveLength(4)
    })

    it('shows no deal for a round given up during the countdown', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.leave('host')
      watcher.sent = []
      await vi.advanceTimersByTimeAsync(4_000)

      expect(room.state.status).toBe(GameStatus.RoundFinished)
      expect(room.state.players.peer?.cards).toEqual([])
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
      expect(room.state.status).toBe(GameStatus.Starting)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(room.state.status).toBe(GameStatus.InGame)
    })

    it('shows no deal for a room closed during the countdown', async () => {
      const room = roomOf(between())
      room.gameplay.startRound('host')

      room.close()
      watcher.sent = []
      await vi.advanceTimersByTimeAsync(4_000)

      expect(watcher.sent).toEqual([])
      expect(room.state.status).toBe(GameStatus.Starting)
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

    /** The callback of the countdown a start schedules, to run by hand as a timer that fires despite being cleared would. */
    const startCapturingCountdown = (room: Room) => {
      const scheduled = vi.spyOn(globalThis, 'setTimeout')
      room.gameplay.startRound('host')
      const [callback, delay] = scheduled.mock.calls.at(-1)!
      scheduled.mockRestore()
      expect(delay).toBe(4_000)
      return callback as () => void
    }

    it('deals nothing from a replaced countdown that fires anyway, and deals the new round on its own schedule', async () => {
      const room = roomOf(between())
      const stale = startCapturingCountdown(room)
      await vi.advanceTimersByTimeAsync(3_000)
      room.leave('peer')
      join(room, 'peer')

      stale()
      expect(room.state.status).toBe(GameStatus.RoundFinished)

      room.gameplay.startRound('host')
      const restarted = structuredClone(room.state)
      watcher.sent = []

      stale()
      expect(room.state).toEqual(restarted)
      expect(room.state.status).toBe(GameStatus.Starting)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(1_000)
      expect(room.state).toEqual(restarted)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(2_999)
      expect(room.state).toEqual(restarted)
      expect(watcher.sent).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(watcher.sent).toEqual([updateGameAction(room.state)])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('deals nothing from the countdown of a closed room that fires anyway', () => {
      const room = roomOf(between())
      const stale = startCapturingCountdown(room)
      room.close()
      const closed = structuredClone(room.state)
      watcher.sent = []

      stale()

      expect(room.state).toEqual(closed)
      expect(room.state.status).toBe(GameStatus.Starting)
      expect(watcher.sent).toEqual([])
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

    it('lets the next round start straight away', async () => {
      const room = claimed()

      room.gameplay.startRound('host')
      expect(room.state.status).toBe(GameStatus.Starting)

      await vi.advanceTimersByTimeAsync(4_000)
      expect(room.state.status).toBe(GameStatus.InGame)
      expect(room.state.players.host?.ligrettoDeck.cards).toHaveLength(10)
    })
  })
})
