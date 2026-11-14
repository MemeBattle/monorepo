import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../../test/support/pglite.ts'
import { seedUsers } from '../../../test/support/seed.ts'
import type { RoundResult } from '../../core/ports/games-repository.ts'
import type { Leader, LeaderboardWindow } from '../../core/ports/leaders-repository.ts'
import type { AccountType } from '../../core/ports/users-repository.ts'
import { createPgGamesRepository } from './games-repository.ts'
import { createPgLeadersRepository } from './leaders-repository.ts'
import { upsertUser } from './users-repository.ts'

let database: Awaited<ReturnType<typeof createTestDatabase>>
let gameId: string

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  // Undefined when beforeAll timed out: its error is the one to report.
  await database?.close()
})

beforeEach(async () => {
  const { db } = database
  await db.deleteFrom('user_daily_points').execute()
  await db.deleteFrom('user_totals').execute()
  await db.deleteFrom('round_users').execute()
  await db.deleteFrom('rounds').execute()
  await db.deleteFrom('games').execute()
  await db.deleteFrom('users').execute()
  gameId = (await createPgGamesRepository(db).createGame()).id
})

const DAY = '2026-11-14'

const player = (sub: string, displayName: string | null, accountType: AccountType = 'full') => ({ sub, accountType, displayName, avatarUrl: null })

/** Writes points through the save-round statement itself. */
const addPoints = async (day: string, results: RoundResult[]) => {
  const result = await createPgGamesRepository(database.db).withGame(gameId, game => game.addPoints(day, results))
  expect(result.status).toBe('ok')
}

const rank = (window: LeaderboardWindow = 'all', { limit = 100, viewer = 'nobody' } = {}) =>
  createPgLeadersRepository(database.db).rank({ window, limit, viewer })

/** `sub`, `points` and `place` of each row, in order. */
const standings = (leaders: Leader[]) => leaders.map(({ sub, points, place }) => ({ sub, points, place }))

const oneDay = (date: string): LeaderboardWindow => ({ from: date, to: date })

describe('LeadersRepository: Kysely on PGlite', () => {
  it('shares a place between tied points and skips the places they take', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b'), player('c', 'c'), player('d', 'd')])
    await addPoints(DAY, [
      { playerId: 'a', score: 10 },
      { playerId: 'b', score: 7 },
      { playerId: 'c', score: 7 },
      { playerId: 'd', score: 3 },
    ])
    expect(standings((await rank()).top)).toEqual([
      { sub: 'a', points: 10, place: 1 },
      { sub: 'b', points: 7, place: 2 },
      { sub: 'c', points: 7, place: 2 },
      { sub: 'd', points: 3, place: 4 },
    ])
  })

  it('lists tied players by name, the nameless last, then by sub', async () => {
    await seedUsers(database.db, [player('s1', 'zoe'), player('s2', null), player('s3', 'amy'), player('s4', null), player('s5', 'amy')])
    await addPoints(
      DAY,
      ['s1', 's2', 's3', 's4', 's5'].map(playerId => ({ playerId, score: 5 })),
    )
    const { top } = await rank()
    expect(top.map(leader => leader.sub)).toEqual(['s3', 's5', 's1', 's2', 's4'])
    expect(new Set(top.map(leader => leader.place))).toEqual(new Set([1]))
  })

  it('answers the profile snapshot of each player', async () => {
    await seedUsers(database.db, [{ sub: 'a', accountType: 'full', displayName: 'Alice', avatarUrl: 'https://avatars.example/a.png' }])
    await addPoints(DAY, [{ playerId: 'a', score: 4 }])
    expect((await rank()).top).toEqual([{ sub: 'a', displayName: 'Alice', avatarUrl: 'https://avatars.example/a.png', points: 4, place: 1 }])
  })

  it('leaves a guest out, and gives their points no place', async () => {
    await seedUsers(database.db, [player('guest', null, 'guest'), player('a', 'a'), player('b', 'b')])
    await addPoints(DAY, [
      { playerId: 'guest', score: 100 },
      { playerId: 'a', score: 5 },
      { playerId: 'b', score: 1 },
    ])
    expect(standings((await rank()).top)).toEqual([
      { sub: 'a', points: 5, place: 1 },
      { sub: 'b', points: 1, place: 2 },
    ])
  })

  it('sums only the days of the window', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b')])
    await addPoints('2026-11-13', [{ playerId: 'a', score: 100 }])
    await addPoints('2026-11-14', [
      { playerId: 'a', score: 1 },
      { playerId: 'b', score: 2 },
    ])
    await addPoints('2026-11-15', [{ playerId: 'b', score: 100 }])
    expect(standings((await rank(oneDay('2026-11-14'))).top)).toEqual([
      { sub: 'b', points: 2, place: 1 },
      { sub: 'a', points: 1, place: 2 },
    ])
  })

  it('sums every day of a longer window', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b')])
    await addPoints('2026-10-15', [{ playerId: 'b', score: 100 }])
    await addPoints('2026-10-16', [{ playerId: 'a', score: 3 }])
    await addPoints('2026-11-01', [{ playerId: 'a', score: 4 }])
    await addPoints('2026-11-14', [
      { playerId: 'a', score: 5 },
      { playerId: 'b', score: 1 },
    ])
    expect(standings((await rank({ from: '2026-10-16', to: '2026-11-14' })).top)).toEqual([
      { sub: 'a', points: 12, place: 1 },
      { sub: 'b', points: 1, place: 2 },
    ])
  })

  it('ranks all time by the totals', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b')])
    await addPoints('2020-01-01', [{ playerId: 'a', score: 3 }])
    await addPoints(DAY, [
      { playerId: 'a', score: 3 },
      { playerId: 'b', score: 5 },
    ])
    expect(standings((await rank('all')).top)).toEqual([
      { sub: 'a', points: 6, place: 1 },
      { sub: 'b', points: 5, place: 2 },
    ])
  })

  it('cuts the list at the limit by position, also inside a tie', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b'), player('c', 'c')])
    await addPoints(DAY, [
      { playerId: 'a', score: 9 },
      { playerId: 'b', score: 5 },
      { playerId: 'c', score: 5 },
    ])
    expect(standings((await rank('all', { limit: 2 })).top)).toEqual([
      { sub: 'a', points: 9, place: 1 },
      { sub: 'b', points: 5, place: 2 },
    ])
  })

  it('answers a viewer outside the top with their true place', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b'), player('c', 'c')])
    await addPoints(DAY, [
      { playerId: 'a', score: 9 },
      { playerId: 'b', score: 5 },
      { playerId: 'c', score: 1 },
    ])
    const { top, viewer } = await rank('all', { limit: 1, viewer: 'c' })
    expect(standings(top)).toEqual([{ sub: 'a', points: 9, place: 1 }])
    expect(viewer).toEqual({ sub: 'c', displayName: 'c', avatarUrl: null, points: 1, place: 3 })
  })

  it('answers a viewer inside the top both in the list and as the viewer', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b')])
    await addPoints(DAY, [
      { playerId: 'a', score: 9 },
      { playerId: 'b', score: 5 },
    ])
    const { top, viewer } = await rank('all', { viewer: 'b' })
    expect(top).toHaveLength(2)
    expect(viewer).toEqual(top[1])
  })

  it('answers no viewer for a guest, and for a full account without points', async () => {
    await seedUsers(database.db, [player('guest', null, 'guest'), player('a', 'a'), player('idle', 'idle')])
    await addPoints(DAY, [
      { playerId: 'guest', score: 3 },
      { playerId: 'a', score: 1 },
    ])
    expect((await rank('all', { viewer: 'guest' })).viewer).toBeUndefined()
    expect((await rank('all', { viewer: 'idle' })).viewer).toBeUndefined()
  })

  it('shows a rename and an upgrade to a full account on the next read', async () => {
    await seedUsers(database.db, [player('a', 'before'), player('guest', null, 'guest')])
    await addPoints(DAY, [
      { playerId: 'a', score: 1 },
      { playerId: 'guest', score: 2 },
    ])
    expect(standings((await rank()).top)).toEqual([{ sub: 'a', points: 1, place: 1 }])
    await upsertUser(database.db, player('a', 'after'), new Date())
    await upsertUser(database.db, player('guest', 'upgraded'), new Date())
    const { top } = await rank()
    expect(top.map(({ sub, displayName, place }) => ({ sub, displayName, place }))).toEqual([
      { sub: 'guest', displayName: 'upgraded', place: 1 },
      { sub: 'a', displayName: 'after', place: 2 },
    ])
  })

  it.each([['all' as const], [oneDay(DAY)]])('answers a sum beyond the int32 range exactly, window %j', async window => {
    await seedUsers(database.db, [player('a', 'a')])
    await addPoints(DAY, [{ playerId: 'a', score: 2147483647 }])
    await addPoints(DAY, [{ playerId: 'a', score: 2147483647 }])
    expect(standings((await rank(window)).top)).toEqual([{ sub: 'a', points: 4294967294, place: 1 }])
  })

  it('ranks zero and negative points below positive ones', async () => {
    await seedUsers(database.db, [player('a', 'a'), player('b', 'b'), player('c', 'c')])
    await addPoints(DAY, [
      { playerId: 'a', score: -4 },
      { playerId: 'b', score: 0 },
      { playerId: 'c', score: 2 },
    ])
    expect(standings((await rank()).top)).toEqual([
      { sub: 'c', points: 2, place: 1 },
      { sub: 'b', points: 0, place: 2 },
      { sub: 'a', points: -4, place: 3 },
    ])
  })
})
