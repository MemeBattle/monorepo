import { describe, expect, it } from 'vitest'
import { CardColors, GameStatus, PlayerStatus, type Card, type Game, type Player } from '@memebattle/ligretto-shared'
import {
  addPlayer,
  canResumeRound,
  canSetReadiness,
  canStartRound,
  closeRound,
  createGame,
  dealRound,
  joinsAsSpectator,
  leaveRoom,
  markPlayerConnected,
  markPlayerDisconnected,
  removeSpectator,
  scoreRound,
  setPlayerStatus,
  transferDisconnectedHost,
} from './room'

const card = (playerId: string, value = 1): Card => ({ color: CardColors.red, value, playerId })

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.InGame,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

const game = (overrides: Partial<Game> = {}): Game => ({ ...createGame('game', 'Room'), ...overrides })

const roster = (...players: Player[]): Game['players'] => Object.fromEntries(players.map(current => [current.id, current]))

/** A host and a peer, both online, in the given status. */
const pair = (status: GameStatus, host: Partial<Player> = {}, peer: Partial<Player> = {}) =>
  game({ status, players: roster(player('host', { isHost: true, ...host }), player('peer', peer)) })

const statusesOf = (state: Game) => Object.fromEntries(Object.values(state.players).map(current => [current!.id, current!.status]))

const hostOf = (state: Game) => Object.values(state.players).find(current => current!.isHost)?.id

describe('joinsAsSpectator', () => {
  it.each([GameStatus.New, GameStatus.Starting, GameStatus.RoundFinished])('lets a newcomer play in %s', status => {
    expect(joinsAsSpectator(pair(status))).toBe(false)
  })

  it.each([GameStatus.InGame, GameStatus.Pause])('makes a newcomer a spectator in %s', status => {
    expect(joinsAsSpectator(pair(status))).toBe(true)
  })

  it('makes a newcomer a spectator in a full room', () => {
    expect(joinsAsSpectator(game({ players: roster(player('a'), player('b'), player('c'), player('d')) }))).toBe(true)
  })
})

describe('addPlayer', () => {
  it('makes the first player the host, and nobody after', () => {
    const state = addPlayer(addPlayer(game(), 'host'), 'peer')

    expect(state.players.host).toMatchObject({ isHost: true, status: PlayerStatus.DontReadyToPlay })
    expect(state.players.peer).toMatchObject({ isHost: false, status: PlayerStatus.DontReadyToPlay })
  })
})

describe('removeSpectator', () => {
  it('removes a spectator', () => {
    expect(removeSpectator(game({ spectators: { watcher: { id: 'watcher' } } }), 'watcher')?.spectators).toEqual({})
  })

  it('returns nothing for someone who is not a spectator', () => {
    expect(removeSpectator(pair(GameStatus.New), 'host')).toBeUndefined()
  })
})

describe('setPlayerStatus', () => {
  it('changes nothing for someone who is not a player', () => {
    const before = pair(GameStatus.New)

    expect(setPlayerStatus(before, 'spectator', PlayerStatus.ReadyToPlay)).toBe(before)
  })
})

describe('canStartRound', () => {
  it.each([GameStatus.New, GameStatus.RoundFinished])('lets the online host start from %s', status => {
    expect(canStartRound(pair(status), 'host')).toBe(true)
  })

  it('does not let anyone but the host start', () => {
    expect(canStartRound(pair(GameStatus.New), 'peer')).toBe(false)
  })

  it('does not let a disconnected host start', () => {
    expect(canStartRound(pair(GameStatus.New, { status: PlayerStatus.Disconnected }), 'host')).toBe(false)
  })

  it('needs two players online', () => {
    expect(canStartRound(pair(GameStatus.New, {}, { status: PlayerStatus.Disconnected }), 'host')).toBe(false)
  })

  it.each([GameStatus.Starting, GameStatus.InGame, GameStatus.Pause])('does not start over a round in %s', status => {
    expect(canStartRound(pair(status), 'host')).toBe(false)
  })
})

describe('canResumeRound', () => {
  it('lets the online host resume a paused round', () => {
    expect(canResumeRound(pair(GameStatus.Pause), 'host')).toBe(true)
  })

  it('does not let anyone but the host resume', () => {
    expect(canResumeRound(pair(GameStatus.Pause), 'peer')).toBe(false)
  })

  it('needs two players online', () => {
    expect(canResumeRound(pair(GameStatus.Pause, {}, { status: PlayerStatus.Disconnected }), 'host')).toBe(false)
  })

  it('resumes nothing but a paused round', () => {
    expect(canResumeRound(pair(GameStatus.InGame), 'host')).toBe(false)
  })
})

describe('canSetReadiness', () => {
  it.each([PlayerStatus.ReadyToPlay, PlayerStatus.DontReadyToPlay])('lets a player say %s between rounds', status => {
    expect(canSetReadiness(pair(GameStatus.RoundFinished), 'peer', status)).toBe(true)
  })

  it.each([PlayerStatus.InGame, PlayerStatus.Disconnected])('does not let a player claim %s', status => {
    expect(canSetReadiness(pair(GameStatus.New), 'peer', status)).toBe(false)
  })

  it('does not let a player change readiness during a round', () => {
    expect(canSetReadiness(pair(GameStatus.InGame), 'peer', PlayerStatus.ReadyToPlay)).toBe(false)
  })

  it('does not let a disconnected player or a spectator change readiness', () => {
    const state = pair(GameStatus.New, {}, { status: PlayerStatus.Disconnected })

    expect(canSetReadiness(state, 'peer', PlayerStatus.ReadyToPlay)).toBe(false)
    expect(canSetReadiness(state, 'spectator', PlayerStatus.ReadyToPlay)).toBe(false)
  })
})

describe('dealRound', () => {
  it.each([
    [2, 5],
    [3, 4],
    [4, 3],
    [5, 3],
  ])('gives each of %i players %i cards in a row', (count, cardsInRow) => {
    const ids = Array.from({ length: count }, (_, index) => `p${index}`)
    const dealt = dealRound(game({ players: roster(...ids.map(id => player(id))) }))

    for (const id of ids) {
      const dealtPlayer = dealt.players[id]!
      expect(dealtPlayer.cards).toHaveLength(cardsInRow)
      expect(dealtPlayer.ligrettoDeck.cards).toHaveLength(10)
      expect(dealtPlayer.cards.length + dealtPlayer.ligrettoDeck.cards.length + dealtPlayer.stackDeck.cards.length).toBe(40)
    }
  })

  it('starts the round on a cleared table', () => {
    const dealt = dealRound(pair(GameStatus.Starting, { status: PlayerStatus.ReadyToPlay }, { status: PlayerStatus.ReadyToPlay }))

    expect(dealt.status).toBe(GameStatus.InGame)
    expect(statusesOf(dealt)).toEqual({ host: PlayerStatus.InGame, peer: PlayerStatus.InGame })
    expect(dealt.playground).toEqual({ decks: new Array(12).fill(null), droppedDecks: [] })
  })

  it('keeps a disconnected player disconnected, with a hand to return to', () => {
    const dealt = dealRound(pair(GameStatus.Starting, {}, { status: PlayerStatus.Disconnected }))

    expect(dealt.players.peer!.status).toBe(PlayerStatus.Disconnected)
    expect(dealt.players.peer!.ligrettoDeck.cards).toHaveLength(10)
  })
})

describe('scoreRound', () => {
  it('counts the cards on the table and in dropped decks minus twice the ligretto deck', () => {
    const results = scoreRound(
      game({
        players: { host: player('host'), peer: player('peer', { ligrettoDeck: { isHidden: true, cards: [card('peer'), card('peer', 2)] } }) },
        playground: {
          decks: [{ isHidden: false, cards: [card('host'), card('host', 2)] }, null, { isHidden: false, cards: [card('peer')] }],
          droppedDecks: [{ isHidden: false, cards: [card('host', 3)] }],
        },
      }),
    )

    expect(results).toEqual([
      { playerId: 'host', score: 3 },
      { playerId: 'peer', score: -3 },
    ])
  })

  it('scores a player with nothing on the table', () => {
    expect(scoreRound(game({ players: { host: player('host') } }))).toEqual([{ playerId: 'host', score: 0 }])
  })

  it('leaves out someone who left with cards on the table', () => {
    const results = scoreRound(
      game({
        players: { host: player('host') },
        playground: { decks: [{ isHidden: false, cards: [card('gone'), card('host')] }], droppedDecks: [] },
      }),
    )

    expect(results).toEqual([{ playerId: 'host', score: 1 }])
  })
})

describe('closeRound', () => {
  it('asks everyone online for readiness again, keeps the disconnected disconnected and clears the table', () => {
    const closed = closeRound({
      ...pair(GameStatus.RoundFinished, {}, { status: PlayerStatus.Disconnected }),
      playground: { decks: [{ isHidden: false, cards: [card('host')] }], droppedDecks: [{ isHidden: false, cards: [card('peer')] }] },
    })

    expect(statusesOf(closed)).toEqual({ host: PlayerStatus.DontReadyToPlay, peer: PlayerStatus.Disconnected })
    expect(closed.playground).toEqual({ decks: new Array(12).fill(null), droppedDecks: [] })
  })
})

describe('leaveRoom', () => {
  it('removes a player and a spectator', () => {
    const left = leaveRoom(leaveRoom({ ...pair(GameStatus.New), spectators: { watcher: { id: 'watcher' } } }, 'peer'), 'watcher')

    expect(Object.keys(left.players)).toEqual(['host'])
    expect(left.spectators).toEqual({})
  })

  it('passes the host to an online player over a disconnected one', () => {
    const state = game({
      players: roster(player('host', { isHost: true }), player('away', { status: PlayerStatus.Disconnected }), player('online')),
    })

    expect(hostOf(leaveRoom(state, 'host'))).toBe('online')
  })

  it('passes the host to a disconnected player when nobody else is left', () => {
    expect(hostOf(leaveRoom(pair(GameStatus.New, {}, { status: PlayerStatus.Disconnected }), 'host'))).toBe('peer')
  })

  it('leaves an empty roster when the last player leaves', () => {
    expect(leaveRoom(game({ players: roster(player('host', { isHost: true })) }), 'host').players).toEqual({})
  })

  it.each([GameStatus.InGame, GameStatus.Pause])('abandons a round in %s that falls below two players online', status => {
    const left = leaveRoom({ ...pair(status), playground: { decks: [{ isHidden: false, cards: [card('host')] }], droppedDecks: [] } }, 'peer')

    expect(left.status).toBe(GameStatus.RoundFinished)
    expect(statusesOf(left)).toEqual({ host: PlayerStatus.DontReadyToPlay })
    expect(left.playground.decks.every(current => current === null)).toBe(true)
  })

  it('keeps a round going while two players are online', () => {
    const state = game({ status: GameStatus.InGame, players: roster(player('host', { isHost: true }), player('peer'), player('third')) })

    expect(leaveRoom(state, 'third').status).toBe(GameStatus.InGame)
  })

  it('keeps a room between rounds as it is', () => {
    expect(leaveRoom(pair(GameStatus.New), 'peer').status).toBe(GameStatus.New)
  })
})

describe('markPlayerDisconnected', () => {
  it('pauses a round that falls below two players online', () => {
    const state = markPlayerDisconnected(pair(GameStatus.InGame), 'peer')!

    expect(state.status).toBe(GameStatus.Pause)
    expect(state.players.peer!.status).toBe(PlayerStatus.Disconnected)
  })

  it('keeps a round going while two players are online', () => {
    const state = game({ status: GameStatus.InGame, players: roster(player('host', { isHost: true }), player('peer'), player('third')) })

    expect(markPlayerDisconnected(state, 'third')!.status).toBe(GameStatus.InGame)
  })

  it.each([GameStatus.New, GameStatus.Starting, GameStatus.RoundFinished])('does not pause in %s', status => {
    expect(markPlayerDisconnected(pair(status), 'peer')!.status).toBe(status)
  })

  it('returns nothing for someone already disconnected or not a player', () => {
    const state = pair(GameStatus.InGame, {}, { status: PlayerStatus.Disconnected })

    expect(markPlayerDisconnected(state, 'peer')).toBeUndefined()
    expect(markPlayerDisconnected(state, 'spectator')).toBeUndefined()
  })
})

describe('markPlayerConnected', () => {
  it.each([GameStatus.New, GameStatus.RoundFinished])('asks a player returning in %s for readiness again', status => {
    const state = markPlayerConnected(pair(status, {}, { status: PlayerStatus.Disconnected }), 'peer')

    expect(state.players.peer!.status).toBe(PlayerStatus.DontReadyToPlay)
  })

  it.each([GameStatus.Starting, GameStatus.InGame, GameStatus.Pause])('returns a player to their hand in %s', status => {
    const state = markPlayerConnected(pair(status, {}, { status: PlayerStatus.Disconnected }), 'peer')

    expect(state.players.peer!.status).toBe(PlayerStatus.InGame)
  })

  it('changes nothing for a player who is online', () => {
    const before = pair(GameStatus.New, {}, { status: PlayerStatus.ReadyToPlay })

    expect(markPlayerConnected(before, 'peer')).toBe(before)
  })
})

describe('transferDisconnectedHost', () => {
  it('hands the role of a disconnected host to the online player first by id', () => {
    const state = game({
      players: roster(player('host', { isHost: true, status: PlayerStatus.Disconnected }), player('zed'), player('amy')),
    })

    expect(hostOf(transferDisconnectedHost(state)!)).toBe('amy')
  })

  it('returns nothing while the host is online', () => {
    expect(transferDisconnectedHost(pair(GameStatus.New))).toBeUndefined()
  })

  it('returns nothing when nobody is online to take over', () => {
    expect(
      transferDisconnectedHost(pair(GameStatus.New, { status: PlayerStatus.Disconnected }, { status: PlayerStatus.Disconnected })),
    ).toBeUndefined()
  })
})
