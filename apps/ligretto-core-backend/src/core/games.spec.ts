import { beforeEach, describe, expect, it } from 'vitest'

import { createCreateGame, createSaveRound } from './games'
import { createFakeGamesRepository, type FakeGamesRepository } from './ports/games-repository.fake'
import { createFakeUsersRepository } from './ports/users-repository.fake'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let repo: FakeGamesRepository
let createGame: ReturnType<typeof createCreateGame>
let saveRound: ReturnType<typeof createSaveRound>

beforeEach(() => {
  const users = createFakeUsersRepository(['alice', 'bob', 'carol'].map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })))
  repo = createFakeGamesRepository(users)
  createGame = createCreateGame({ games: repo })
  saveRound = createSaveRound({ games: repo })
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
