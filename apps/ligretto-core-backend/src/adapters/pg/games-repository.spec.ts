import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../../test/support/pglite.ts'
import { seedUsers } from '../../../test/support/seed.ts'
import type { GamesRepository, RoundResult } from '../../core/ports/games-repository.ts'
import { createFakeGamesRepository } from '../../core/ports/games-repository.fake.ts'
import { createFakeUsersRepository } from '../../core/ports/users-repository.fake.ts'
import { createPgGamesRepository } from './games-repository.ts'

type DailyPoints = Array<{ day: string; playerId: string; points: number }>
type TotalPoints = Array<{ playerId: string; points: number }>

/** One implementation under the contract, with what the assertions need to look behind it. */
type Subject = {
  repo: GamesRepository
  seedPlayers(ids: string[]): Promise<void>
  gameExists(id: string): Promise<boolean>
  roundExists(id: string): Promise<boolean>
  roundUserCount(): Promise<number>
  /** The committed leaderboard points, ordered by day, then player. */
  dailyPoints(): Promise<DailyPoints>
  /** The committed all-time leaderboard points, ordered by player. */
  totalPoints(): Promise<TotalPoints>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const INSERTED = { inserted: true, createdAt: expect.any(Date) }

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

let database: Awaited<ReturnType<typeof createTestDatabase>>

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  // Undefined when beforeAll timed out: its error is the one to report.
  await database?.close()
})

const pgSubject = async (): Promise<Subject> => {
  const { db } = database
  await db.deleteFrom('user_daily_points').execute()
  await db.deleteFrom('user_totals').execute()
  await db.deleteFrom('round_users').execute()
  await db.deleteFrom('rounds').execute()
  await db.deleteFrom('games').execute()
  await db.deleteFrom('users').execute()
  return {
    repo: createPgGamesRepository(db),
    seedPlayers: ids =>
      seedUsers(
        db,
        ids.map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })),
      ),
    gameExists: async id => (await db.selectFrom('games').select('id').where('id', '=', id).executeTakeFirst()) !== undefined,
    roundExists: async id => (await db.selectFrom('rounds').select('id').where('id', '=', id).executeTakeFirst()) !== undefined,
    roundUserCount: async () => (await db.selectFrom('round_users').select('round_id').execute()).length,
    dailyPoints: async () => {
      const rows = await db
        .selectFrom('user_daily_points')
        .select(eb => [eb.cast<string>('day', 'text').as('day'), 'user_id', 'points'])
        .orderBy('day')
        .orderBy('user_id')
        .execute()
      return rows.map(row => ({ day: row.day, playerId: row.user_id, points: Number(row.points) }))
    },
    totalPoints: async () => {
      const rows = await db.selectFrom('user_totals').select(['user_id', 'points']).orderBy('user_id').execute()
      return rows.map(row => ({ playerId: row.user_id, points: Number(row.points) }))
    },
  }
}

const fakeSubject = async (): Promise<Subject> => {
  const users = createFakeUsersRepository()
  const repo = createFakeGamesRepository(users)
  return {
    repo,
    seedPlayers: async ids => {
      for (const sub of ids) {
        users.set({ sub, accountType: 'full', displayName: sub, avatarUrl: null })
      }
    },
    gameExists: async id => repo.games.has(id),
    roundExists: async id => repo.rounds.has(id),
    roundUserCount: async () => [...repo.rounds.values()].reduce((count, round) => count + round.results.length, 0),
    dailyPoints: async () =>
      [...repo.dailyPoints]
        .map(([key, points]) => {
          const [day, playerId] = key.split(' ')
          return { day, playerId, points }
        })
        .sort((a, b) => compareStrings(a.day, b.day) || compareStrings(a.playerId, b.playerId)),
    totalPoints: async () =>
      [...repo.totalPoints].map(([playerId, points]) => ({ playerId, points })).sort((a, b) => compareStrings(a.playerId, b.playerId)),
  }
}

/** Runs `fn` on the locked game and answers its value; fails the test when the game is missing. */
const onGame = async <T>(repo: GamesRepository, gameId: string, fn: Parameters<GamesRepository['withGame']>[1]): Promise<T> => {
  const result = await repo.withGame(gameId, fn)
  if (result.status !== 'ok') {
    throw new Error(`game ${gameId} not found`)
  }
  return result.value as T
}

describe.each([
  ['Kysely on PGlite', pgSubject],
  ['in-memory fake', fakeSubject],
])('GamesRepository: %s', (_name, makeSubject) => {
  let subject: Subject

  beforeEach(async () => {
    subject = await makeSubject()
    await subject.seedPlayers(['alice', 'bob', 'carol'])
  })

  it('creates a game with a uuid', async () => {
    const { id } = await subject.repo.createGame()
    expect(id).toMatch(UUID)
    expect(await subject.gameExists(id)).toBe(true)
  })

  it('answers game_not_found for an unknown game without calling the callback', async () => {
    let called = false
    const result = await subject.repo.withGame(crypto.randomUUID(), async () => {
      called = true
    })
    expect(result).toEqual({ status: 'game_not_found' })
    expect(called).toBe(false)
  })

  it("answers ok with the callback's value", async () => {
    const { id } = await subject.repo.createGame()
    expect(await subject.repo.withGame(id, async () => 42)).toEqual({ status: 'ok', value: 42 })
  })

  it('reports the players with no users row, in input order, once each', async () => {
    const { id } = await subject.repo.createGame()
    const answers = await onGame<string[][]>(subject.repo, id, async game => [
      await game.missingPlayers(['alice', 'bob']),
      await game.missingPlayers(['zed', 'alice', 'yan', 'zed']),
      await game.missingPlayers([]),
    ])
    expect(answers).toEqual([[], ['zed', 'yan'], []])
  })

  it('leaves nothing behind when the callback throws after inserting and adding points', async () => {
    const { id } = await subject.repo.createGame()
    await onGame(subject.repo, id, async game => {
      await game.insertRound(crypto.randomUUID(), [{ playerId: 'alice', score: 2 }])
      await game.addPoints('2026-11-14', [{ playerId: 'alice', score: 2 }])
    })
    const before = { roundUsers: await subject.roundUserCount(), daily: await subject.dailyPoints(), totals: await subject.totalPoints() }
    const roundId = crypto.randomUUID()
    const rejection = new Error('unknown_players')
    await expect(
      subject.repo.withGame(id, async game => {
        const results = [
          { playerId: 'alice', score: 3 },
          { playerId: 'carol', score: 4 },
        ]
        expect(await game.insertRound(roundId, results)).toEqual(INSERTED)
        await game.addPoints('2026-11-14', results)
        expect(await game.missingPlayers(['alice', 'ghost'])).toEqual(['ghost'])
        throw rejection
      }),
    ).rejects.toBe(rejection)
    expect(await subject.roundExists(roundId)).toBe(false)
    expect({ roundUsers: await subject.roundUserCount(), daily: await subject.dailyPoints(), totals: await subject.totalPoints() }).toEqual(before)
    expect(before).toEqual({
      roundUsers: 1,
      daily: [{ day: '2026-11-14', playerId: 'alice', points: 2 }],
      totals: [{ playerId: 'alice', points: 2 }],
    })
  })

  it('adds points to the daily rows and the totals', async () => {
    const { id } = await subject.repo.createGame()
    await onGame(subject.repo, id, game =>
      game.addPoints('2026-11-14', [
        { playerId: 'bob', score: 3 },
        { playerId: 'alice', score: 5 },
      ]),
    )
    expect(await subject.dailyPoints()).toEqual([
      { day: '2026-11-14', playerId: 'alice', points: 5 },
      { day: '2026-11-14', playerId: 'bob', points: 3 },
    ])
    expect(await subject.totalPoints()).toEqual([
      { playerId: 'alice', points: 5 },
      { playerId: 'bob', points: 3 },
    ])
  })

  it('increments the rows of the same day, and keeps another day apart while the total grows', async () => {
    const { id } = await subject.repo.createGame()
    await onGame(subject.repo, id, game => game.addPoints('2026-11-14', [{ playerId: 'alice', score: 5 }]))
    await onGame(subject.repo, id, game => game.addPoints('2026-11-14', [{ playerId: 'alice', score: 4 }]))
    await onGame(subject.repo, id, game => game.addPoints('2026-11-15', [{ playerId: 'alice', score: 10 }]))
    await onGame(subject.repo, id, game => game.addPoints('2026-11-15', [{ playerId: 'alice', score: -3 }]))
    expect(await subject.dailyPoints()).toEqual([
      { day: '2026-11-14', playerId: 'alice', points: 9 },
      { day: '2026-11-15', playerId: 'alice', points: 7 },
    ])
    expect(await subject.totalPoints()).toEqual([{ playerId: 'alice', points: 16 }])
  })

  it('writes nothing for no results', async () => {
    const { id } = await subject.repo.createGame()
    await onGame(subject.repo, id, game => game.addPoints('2026-11-14', []))
    expect(await subject.dailyPoints()).toEqual([])
    expect(await subject.totalPoints()).toEqual([])
  })

  it('inserts a round once and answers inserted: false on a repeat', async () => {
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    const results: RoundResult[] = [
      { playerId: 'alice', score: 3 },
      { playerId: 'bob', score: 1 },
    ]
    expect(await onGame(subject.repo, id, game => game.insertRound(roundId, results))).toEqual(INSERTED)
    expect(await onGame(subject.repo, id, game => game.insertRound(roundId, results))).toEqual({ inserted: false })
    expect(await onGame(subject.repo, id, game => game.insertRound(roundId, [{ playerId: 'carol', score: 9 }]))).toEqual({
      inserted: false,
    })
    expect(await subject.roundUserCount()).toBe(2)
  })

  it('answers inserted: false for a round id of another game, which findRound then reports', async () => {
    const first = await subject.repo.createGame()
    const second = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    await onGame(subject.repo, first.id, game => game.insertRound(roundId, [{ playerId: 'alice', score: 1 }]))
    const answer = await onGame(subject.repo, second.id, async game => ({
      insert: await game.insertRound(roundId, [{ playerId: 'bob', score: 2 }]),
      round: await game.findRound(roundId),
    }))
    expect(answer).toEqual({ insert: { inserted: false }, round: { gameId: first.id, results: [{ playerId: 'alice', score: 1 }] } })
  })

  it('sums the scores of every player across the rounds of the game', async () => {
    const { id } = await subject.repo.createGame()
    const other = await subject.repo.createGame()
    await onGame(subject.repo, id, game =>
      game.insertRound(crypto.randomUUID(), [
        { playerId: 'alice', score: 3 },
        { playerId: 'carol', score: 2 },
      ]),
    )
    await onGame(subject.repo, other.id, game => game.insertRound(crypto.randomUUID(), [{ playerId: 'alice', score: 100 }]))
    const totals = await onGame<Array<{ playerId: string; gameScore: number }>>(subject.repo, id, async game => {
      await game.insertRound(crypto.randomUUID(), [
        { playerId: 'alice', score: 4 },
        { playerId: 'bob', score: -1 },
      ])
      return game.totals()
    })
    expect(totals).toHaveLength(3)
    expect(totals).toEqual(
      expect.arrayContaining([
        { playerId: 'alice', gameScore: 7 },
        { playerId: 'bob', gameScore: -1 },
        { playerId: 'carol', gameScore: 2 },
      ]),
    )
  })

  it('finds a round by id with its owner and results ordered by player', async () => {
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    const found = await onGame(subject.repo, id, async game => {
      const before = await game.findRound(roundId)
      await game.insertRound(roundId, [
        { playerId: 'carol', score: 1 },
        { playerId: 'alice', score: 2 },
      ])
      return { before, after: await game.findRound(roundId) }
    })
    expect(found).toEqual({
      before: undefined,
      after: {
        gameId: id,
        results: [
          { playerId: 'alice', score: 2 },
          { playerId: 'carol', score: 1 },
        ],
      },
    })
  })

  it('rejects a round with a player who has no users row', async () => {
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    await expect(onGame(subject.repo, id, game => game.insertRound(roundId, [{ playerId: 'ghost', score: 1 }]))).rejects.toThrow()
    expect(await subject.roundExists(roundId)).toBe(false)
  })

  // PGlite has one connection, so this asserts the serialisation the fake provides too; the row lock itself is proven
  // on Postgres by the store suite.
  it('runs two callbacks of one game one after the other', async () => {
    const { id } = await subject.repo.createGame()
    const log: string[] = []
    const step = (name: string) => async () => {
      log.push(`${name} start`)
      await new Promise(resolve => setTimeout(resolve, 20))
      log.push(`${name} end`)
    }
    await Promise.all([subject.repo.withGame(id, step('first')), subject.repo.withGame(id, step('second'))])
    expect(log).toEqual(['first start', 'first end', 'second start', 'second end'])
  })
})

describe('GamesRepository: Kysely on PGlite, the time of an inserted round', () => {
  it('answers the stored created_at of the round and of its results', async () => {
    const subject = await pgSubject()
    await subject.seedPlayers(['alice', 'bob'])
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    const insert = await onGame<{ inserted: true; createdAt: Date }>(subject.repo, id, game =>
      game.insertRound(roundId, [
        { playerId: 'alice', score: 1 },
        { playerId: 'bob', score: 2 },
      ]),
    )
    const { db } = database
    const round = await db.selectFrom('rounds').select('created_at').where('id', '=', roundId).executeTakeFirstOrThrow()
    const results = await db.selectFrom('round_users').select('created_at').where('round_id', '=', roundId).execute()
    expect(insert.createdAt.getTime()).toBe(round.created_at.getTime())
    expect(results.map(row => row.created_at.getTime())).toEqual([round.created_at.getTime(), round.created_at.getTime()])
  })
})

// Two games' callbacks run concurrently only in the fake: PGlite has one connection. The same race against Postgres
// is the store suite's (test/store/games-repository.lock.spec.ts).
describe('GamesRepository: in-memory fake, one round id raced by two games', () => {
  const setup = async () => {
    const users = createFakeUsersRepository()
    for (const sub of ['alice', 'bob']) {
      users.set({ sub, accountType: 'full', displayName: sub, avatarUrl: null })
    }
    const repo = createFakeGamesRepository(users)
    const [first, second] = [await repo.createGame(), await repo.createGame()]
    let enterSecond = () => {}
    const secondEntered = new Promise<void>(resolve => {
      enterSecond = resolve
    })
    return { repo, first: first.id, second: second.id, roundId: crypto.randomUUID(), enterSecond, secondEntered }
  }

  it('lets one writer insert and answers the other inserted: false once the first commits', async () => {
    const { repo, first, second, roundId, enterSecond, secondEntered } = await setup()
    const results = await Promise.all([
      repo.withGame(first, async game => {
        const answer = await game.insertRound(roundId, [{ playerId: 'alice', score: 1 }])
        // Hold the insert uncommitted until the second game's callback has run into it.
        await secondEntered
        return answer
      }),
      repo.withGame(second, async game => {
        enterSecond()
        return game.insertRound(roundId, [{ playerId: 'bob', score: 2 }])
      }),
    ])
    expect(results).toEqual([
      { status: 'ok', value: INSERTED },
      { status: 'ok', value: { inserted: false } },
    ])
    expect([...repo.rounds]).toEqual([[roundId, { gameId: first, results: [{ playerId: 'alice', score: 1 }] }]])
  })

  it('lets the waiting writer insert when the first one rolls back', async () => {
    const { repo, first, second, roundId, enterSecond, secondEntered } = await setup()
    const rollback = new Error('rolled back')
    const [firstResult, secondResult] = await Promise.allSettled([
      repo.withGame(first, async game => {
        expect(await game.insertRound(roundId, [{ playerId: 'alice', score: 1 }])).toEqual(INSERTED)
        await secondEntered
        throw rollback
      }),
      repo.withGame(second, async game => {
        enterSecond()
        return game.insertRound(roundId, [{ playerId: 'bob', score: 2 }])
      }),
    ])
    expect(firstResult).toEqual({ status: 'rejected', reason: rollback })
    expect(secondResult).toEqual({ status: 'fulfilled', value: { status: 'ok', value: INSERTED } })
    expect([...repo.rounds]).toEqual([[roundId, { gameId: second, results: [{ playerId: 'bob', score: 2 }] }]])
  })

  it('answers the second of two waiting inserts in one callback inserted: false after a rollback', async () => {
    const { repo, first, second, roundId, enterSecond, secondEntered } = await setup()
    const rollback = new Error('rolled back')
    const [firstResult, secondResult] = await Promise.allSettled([
      repo.withGame(first, async game => {
        expect(await game.insertRound(roundId, [{ playerId: 'alice', score: 1 }])).toEqual(INSERTED)
        await secondEntered
        throw rollback
      }),
      repo.withGame(second, async game => {
        // Both inserts start before either resolves, so both wait on the first game's reservation.
        const answers = Promise.all([
          game.insertRound(roundId, [{ playerId: 'bob', score: 2 }]),
          game.insertRound(roundId, [{ playerId: 'bob', score: 3 }]),
        ])
        enterSecond()
        return answers
      }),
    ])
    expect(firstResult).toEqual({ status: 'rejected', reason: rollback })
    expect(secondResult).toEqual({ status: 'fulfilled', value: { status: 'ok', value: [INSERTED, { inserted: false }] } })
    expect([...repo.rounds]).toEqual([[roundId, { gameId: second, results: [{ playerId: 'bob', score: 2 }] }]])
  })
})
