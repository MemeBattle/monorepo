import { beforeEach, describe, expect, it } from 'vitest'

import { createCreateGame, createGetGameResults, createSaveRound } from './games.ts'
import { createFixedClock } from './ports/clock.fake.ts'
import { createFakeGamesRepository, type FakeGamesRepository } from './ports/games-repository.fake.ts'
import { createFakeUsersRepository } from './ports/users-repository.fake.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The last second of 2026-01-14 in Berlin (CET). */
const BEFORE_BERLIN_MIDNIGHT = Date.UTC(2026, 0, 14, 22, 59, 59)

let clock: ReturnType<typeof createFixedClock>
let repo: FakeGamesRepository
let createGame: ReturnType<typeof createCreateGame>
let saveRound: ReturnType<typeof createSaveRound>
let getGameResults: ReturnType<typeof createGetGameResults>

beforeEach(() => {
  const users = createFakeUsersRepository(['alice', 'bob', 'carol'].map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })))
  clock = createFixedClock(BEFORE_BERLIN_MIDNIGHT)
  repo = createFakeGamesRepository(users, clock)
  createGame = createCreateGame({ games: repo })
  saveRound = createSaveRound({ games: repo })
  getGameResults = createGetGameResults({ games: repo })
})

const roundId = () => crypto.randomUUID()

describe('createGame', () => {
  it('answers a uuid the repository records', async () => {
    const { id } = await createGame()
    expect(id).toMatch(UUID)
    expect(repo.games.has(id)).toBe(true)
  })
})

describe('saveRound', () => {
  it('answers game_not_found for an unknown game', async () => {
    expect(await saveRound(crypto.randomUUID(), roundId(), [{ playerId: 'alice', score: 1 }])).toEqual({ ok: false, error: 'game_not_found' })
    expect(repo.rounds.size).toBe(0)
  })

  it('answers unknown_players with the missing ids in input order, and saves nothing', async () => {
    const { id } = await createGame()
    const result = await saveRound(id, roundId(), [
      { playerId: 'zed', score: 1 },
      { playerId: 'alice', score: 2 },
      { playerId: 'yan', score: 3 },
    ])
    expect(result).toEqual({ ok: false, error: 'unknown_players', playerIds: ['zed', 'yan'] })
    expect(repo.rounds.size).toBe(0)
  })

  it('answers the round score as the game score for a first round', async () => {
    const { id } = await createGame()
    expect(await saveRound(id, roundId(), [{ playerId: 'alice', score: 10 }])).toEqual({
      ok: true,
      value: { gameResults: { alice: { roundScore: 10, gameScore: 10 } } },
    })
  })

  it('accumulates the game score across rounds', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [{ playerId: 'alice', score: 10 }])
    expect(await saveRound(id, roundId(), [{ playerId: 'alice', score: 5 }])).toEqual({
      ok: true,
      value: { gameResults: { alice: { roundScore: 5, gameScore: 15 } } },
    })
  })

  it('answers a player whose id is a property of Object.prototype as an own key', async () => {
    const users = createFakeUsersRepository([{ sub: '__proto__', accountType: 'full', displayName: 'proto', avatarUrl: null }])
    const games = createFakeGamesRepository(users)
    const { id } = await createCreateGame({ games })()
    const result = await createSaveRound({ games })(id, roundId(), [{ playerId: '__proto__', score: 7 }])
    if (!result.ok) {
      throw new Error(`expected a saved round, got ${result.error}`)
    }
    const { gameResults } = result.value
    expect(Object.keys(gameResults)).toEqual(['__proto__'])
    expect(JSON.parse(JSON.stringify(gameResults))).toEqual(JSON.parse('{"__proto__":{"roundScore":7,"gameScore":7}}'))
  })

  it('answers every player of a round', async () => {
    const { id } = await createGame()
    expect(
      await saveRound(id, roundId(), [
        { playerId: 'alice', score: 7 },
        { playerId: 'bob', score: 3 },
      ]),
    ).toEqual({
      ok: true,
      value: { gameResults: { alice: { roundScore: 7, gameScore: 7 }, bob: { roundScore: 3, gameScore: 3 } } },
    })
  })

  it('answers roundScore 0 for a player of an earlier round who is absent from this one', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [
      { playerId: 'alice', score: 4 },
      { playerId: 'carol', score: 6 },
    ])
    expect(await saveRound(id, roundId(), [{ playerId: 'alice', score: 1 }])).toEqual({
      ok: true,
      value: { gameResults: { alice: { roundScore: 1, gameScore: 5 }, carol: { roundScore: 0, gameScore: 6 } } },
    })
  })

  it('answers a repeat with identical results with the same totals and stores the round once', async () => {
    const { id } = await createGame()
    const round = roundId()
    const results = [
      { playerId: 'alice', score: 7 },
      { playerId: 'bob', score: 3 },
    ]
    const first = await saveRound(id, round, results)
    expect(await saveRound(id, round, results)).toEqual(first)
    expect(await saveRound(id, round, [...results].reverse())).toEqual(first)
    expect(repo.rounds.size).toBe(1)
  })

  it('answers round_conflict for the same round id with other scores, and adds nothing', async () => {
    const { id } = await createGame()
    const round = roundId()
    await saveRound(id, round, [{ playerId: 'alice', score: 7 }])
    expect(await saveRound(id, round, [{ playerId: 'alice', score: 8 }])).toEqual({ ok: false, error: 'round_conflict' })
    expect(await saveRound(id, round, [{ playerId: 'bob', score: 7 }])).toEqual({ ok: false, error: 'round_conflict' })
    expect(
      await saveRound(id, round, [
        { playerId: 'alice', score: 7 },
        { playerId: 'bob', score: 1 },
      ]),
    ).toEqual({ ok: false, error: 'round_conflict' })
    expect([...repo.rounds.values()]).toEqual([{ gameId: id, results: [{ playerId: 'alice', score: 7 }] }])
  })

  it('answers round_conflict for a round id another game owns', async () => {
    const first = await createGame()
    const second = await createGame()
    const round = roundId()
    const results = [{ playerId: 'alice', score: 7 }]
    await saveRound(first.id, round, results)
    expect(await saveRound(second.id, round, results)).toEqual({ ok: false, error: 'round_conflict' })
    expect(repo.rounds.size).toBe(1)
  })

  it('answers a repeat with the current totals, including rounds saved since', async () => {
    const { id } = await createGame()
    const repeated = roundId()
    await saveRound(id, repeated, [{ playerId: 'alice', score: 10 }])
    await saveRound(id, roundId(), [{ playerId: 'alice', score: 5 }])
    expect(await saveRound(id, repeated, [{ playerId: 'alice', score: 10 }])).toEqual({
      ok: true,
      value: { gameResults: { alice: { roundScore: 10, gameScore: 15 } } },
    })
    expect(repo.rounds.size).toBe(2)
  })
})

describe('saveRound: leaderboard points', () => {
  const points = () => ({ daily: Object.fromEntries(repo.dailyPoints), totals: Object.fromEntries(repo.totalPoints) })

  it('adds each score to the Berlin day of the round and to the totals', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [
      { playerId: 'alice', score: 7 },
      { playerId: 'bob', score: 3 },
    ])
    clock.advance(1_000)
    await saveRound(id, roundId(), [{ playerId: 'alice', score: 5 }])
    expect(points()).toEqual({
      daily: { '2026-01-14 alice': 7, '2026-01-14 bob': 3, '2026-01-15 alice': 5 },
      totals: { alice: 12, bob: 3 },
    })
  })

  it('accumulates two rounds of one day, and subtracts a negative score', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [{ playerId: 'alice', score: 7 }])
    await saveRound(id, roundId(), [{ playerId: 'alice', score: -2 }])
    expect(points()).toEqual({ daily: { '2026-01-14 alice': 5 }, totals: { alice: 5 } })
  })

  it('adds nothing for a repeat, even after Berlin midnight', async () => {
    const { id } = await createGame()
    const round = roundId()
    const results = [
      { playerId: 'alice', score: 7 },
      { playerId: 'bob', score: 3 },
    ]
    await saveRound(id, round, results)
    clock.advance(1_000)
    expect(await saveRound(id, round, [...results].reverse())).toMatchObject({ ok: true })
    expect(points()).toEqual({ daily: { '2026-01-14 alice': 7, '2026-01-14 bob': 3 }, totals: { alice: 7, bob: 3 } })
  })

  it('adds nothing for round_conflict, unknown_players or game_not_found', async () => {
    const { id } = await createGame()
    const other = await createGame()
    const round = roundId()
    await saveRound(id, round, [{ playerId: 'alice', score: 7 }])
    const before = points()
    expect(await saveRound(id, round, [{ playerId: 'alice', score: 8 }])).toMatchObject({ error: 'round_conflict' })
    expect(await saveRound(other.id, round, [{ playerId: 'alice', score: 7 }])).toMatchObject({ error: 'round_conflict' })
    expect(
      await saveRound(id, roundId(), [
        { playerId: 'alice', score: 1 },
        { playerId: 'zed', score: 1 },
      ]),
    ).toMatchObject({ error: 'unknown_players' })
    expect(await saveRound(crypto.randomUUID(), roundId(), [{ playerId: 'alice', score: 1 }])).toEqual({ ok: false, error: 'game_not_found' })
    expect(points()).toEqual(before)
  })
})

describe('getGameResults', () => {
  it('answers game_not_found for an unknown game', async () => {
    expect(await getGameResults(crypto.randomUUID())).toEqual({ ok: false, error: 'game_not_found' })
  })

  it('answers no entries for a game with no rounds', async () => {
    const { id } = await createGame()
    expect(await getGameResults(id)).toEqual({ ok: true, value: { gameResults: {} } })
  })

  it('answers what saving the latest round answered', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [
      { playerId: 'alice', score: 10 },
      { playerId: 'bob', score: 1 },
    ])
    const saved = await saveRound(id, roundId(), [
      { playerId: 'alice', score: 5 },
      { playerId: 'bob', score: -2 },
    ])
    expect(await getGameResults(id)).toEqual(saved)
  })

  it('gives a player who missed the latest round a round score of 0', async () => {
    const { id } = await createGame()
    await saveRound(id, roundId(), [
      { playerId: 'alice', score: 10 },
      { playerId: 'bob', score: 1 },
    ])
    await saveRound(id, roundId(), [{ playerId: 'alice', score: 5 }])
    expect(await getGameResults(id)).toEqual({
      ok: true,
      value: {
        gameResults: {
          alice: { roundScore: 5, gameScore: 15 },
          bob: { roundScore: 0, gameScore: 1 },
        },
      },
    })
  })

  it('does not count another game', async () => {
    const { id } = await createGame()
    const other = await createGame()
    await saveRound(other.id, roundId(), [{ playerId: 'alice', score: 10 }])
    expect(await getGameResults(id)).toEqual({ ok: true, value: { gameResults: {} } })
  })
})
