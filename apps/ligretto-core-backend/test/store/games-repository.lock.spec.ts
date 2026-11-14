// What PGlite cannot show: the row lock, the round-id race between games and READ COMMITTED visibility, on a real
// Postgres with two independent pools.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../../src/adapters/pg/database.ts'
import { createPgGamesRepository } from '../../src/adapters/pg/games-repository.ts'
import { upsertUser } from '../../src/adapters/pg/users-repository.ts'
import { createSaveRound } from '../../src/core/games.ts'
import type { RoundResult } from '../../src/core/ports/games-repository.ts'
import { disposableDatabaseUrl } from '../support/disposable-database.ts'
import { openDatabase, resetAndMigrate } from '../support/postgres.ts'
import { seedUsers } from '../support/seed.ts'
import { createLockObserver, gate } from '../support/session-store.ts'

const url = disposableDatabaseUrl()

describe('the Kysely GamesRepository on Postgres', () => {
  let dbA: Database
  let dbB: Database
  const observer = createLockObserver(url)
  const lockWaiters = observer.lockWaiters

  beforeAll(async () => {
    await resetAndMigrate(url)
    dbA = openDatabase(url)
    dbB = openDatabase(url)
    await observer.connect()
    await seedUsers(dbA, [
      { sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: null },
      { sub: 'bob', accountType: 'guest', displayName: null, avatarUrl: null },
    ])
  })

  afterAll(async () => {
    await observer.end()
    await Promise.all([dbA.destroy(), dbB.destroy()])
  })

  it('holds a second save of the same game until the first commits', async () => {
    const repoA = createPgGamesRepository(dbA)
    const repoB = createPgGamesRepository(dbB)
    const { id } = await repoA.createGame()
    const log: string[] = []
    const aEntered = gate()
    const releaseA = gate()

    const a = repoA.withGame(id, async () => {
      log.push('a start')
      aEntered.open()
      await releaseA.opened
      log.push('a end')
    })
    await aEntered.opened
    const b = repoB.withGame(id, async () => {
      log.push('b start')
    })
    await expect.poll(lockWaiters).toBeGreaterThanOrEqual(1)
    expect(log).toEqual(['a start'])

    releaseA.open()
    await Promise.all([a, b])
    expect(log).toEqual(['a start', 'a end', 'b start'])
  })

  it('answers inserted: false to the loser of a round id raced between two games', async () => {
    const repoA = createPgGamesRepository(dbA)
    const repoB = createPgGamesRepository(dbB)
    const gameA = await repoA.createGame()
    const gameB = await repoA.createGame()
    const roundId = crypto.randomUUID()
    let bothRead = 0
    const readsDone = gate()
    const aInserted = gate()
    const releaseA = gate()

    const a = repoA.withGame(gameA.id, async game => {
      expect(await game.findRound(roundId)).toBeUndefined()
      bothRead += 1
      if (bothRead === 2) {
        readsDone.open()
      }
      await readsDone.opened
      const insert = await game.insertRound(roundId, [{ playerId: 'alice', score: 5 }])
      aInserted.open()
      await releaseA.opened
      return insert
    })
    const b = repoB.withGame(gameB.id, async game => {
      expect(await game.findRound(roundId)).toBeUndefined()
      bothRead += 1
      if (bothRead === 2) {
        readsDone.open()
      }
      await readsDone.opened
      await aInserted.opened
      const insert = await game.insertRound(roundId, [{ playerId: 'bob', score: 7 }])
      return { insert, round: await game.findRound(roundId) }
    })

    await aInserted.opened
    // B's insert is blocked on A's uncommitted row before A is let go.
    await expect.poll(lockWaiters).toBeGreaterThanOrEqual(1)
    releaseA.open()

    expect(await a).toEqual({ status: 'ok', value: { inserted: true, createdAt: expect.any(Date) } })
    expect(await b).toEqual({
      status: 'ok',
      value: { insert: { inserted: false }, round: { gameId: gameA.id, results: [{ playerId: 'alice', score: 5 }] } },
    })
    const rows = await dbA.selectFrom('round_users').select(['user_id', 'score']).where('round_id', '=', roundId).execute()
    expect(rows).toEqual([{ user_id: 'alice', score: 5 }])
  })

  it('sees only committed users in missingPlayers', async () => {
    const repoA = createPgGamesRepository(dbA)
    const { id } = await repoA.createGame()
    const written = gate()
    const commit = gate()

    // Another pool's transaction writes the user and holds the commit.
    const other = dbB.transaction().execute(async trx => {
      await upsertUser(trx, { sub: 'newcomer', accountType: 'guest', displayName: null, avatarUrl: null }, new Date())
      written.open()
      await commit.opened
    })
    await written.opened

    expect(await repoA.withGame(id, game => game.missingPlayers(['alice', 'newcomer']))).toEqual({ status: 'ok', value: ['newcomer'] })
    commit.open()
    await other
    expect(await repoA.withGame(id, game => game.missingPlayers(['alice', 'newcomer']))).toEqual({ status: 'ok', value: [] })
  })

  describe('the leaderboard points', () => {
    const DAY = '2026-11-14'

    /** Full players no other case has touched, so the sums asserted on them are absolute on the shared database. */
    const freshPlayers = async (count: number): Promise<string[]> => {
      const ids = Array.from({ length: count }, () => `p-${crypto.randomUUID()}`)
      await seedUsers(
        dbA,
        ids.map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })),
      )
      return ids
    }

    const totalsOf = async (ids: string[]) => {
      const rows = await dbA.selectFrom('user_totals').select(['user_id', 'points']).where('user_id', 'in', ids).execute()
      return Object.fromEntries(rows.map(row => [row.user_id, Number(row.points)]))
    }

    /** Each player's daily rows summed over whatever days they fell on. */
    const dailySumsOf = async (ids: string[]) => {
      const rows = await dbA.selectFrom('user_daily_points').select(['user_id', 'points']).where('user_id', 'in', ids).execute()
      const sums: Record<string, number> = {}
      for (const row of rows) {
        sums[row.user_id] = (sums[row.user_id] ?? 0) + Number(row.points)
      }
      return sums
    }

    it('makes a second save sharing players wait for the first, and loses no update', async () => {
      const [x, y] = await freshPlayers(2)
      const repoA = createPgGamesRepository(dbA)
      const repoB = createPgGamesRepository(dbB)
      const gameA = await repoA.createGame()
      const gameB = await repoA.createGame()
      const aAdded = gate()
      const releaseA = gate()

      const first: RoundResult[] = [
        { playerId: x, score: 1 },
        { playerId: y, score: 2 },
      ]
      const a = repoA.withGame(gameA.id, async game => {
        await game.insertRound(crypto.randomUUID(), first)
        await game.addPoints(DAY, first)
        aAdded.open()
        await releaseA.opened
      })
      await aAdded.opened
      const b = repoB.withGame(gameB.id, game =>
        game.addPoints(DAY, [
          { playerId: y, score: 10 },
          { playerId: x, score: 20 },
        ]),
      )
      await expect.poll(lockWaiters).toBeGreaterThanOrEqual(1)

      releaseA.open()
      expect(await Promise.all([a, b])).toEqual([
        { status: 'ok', value: undefined },
        { status: 'ok', value: undefined },
      ])
      expect(await totalsOf([x, y])).toEqual({ [x]: 21, [y]: 12 })
      const daily = await dbA
        .selectFrom('user_daily_points')
        .select(eb => [eb.cast<string>('day', 'text').as('day'), 'user_id', 'points'])
        .where('user_id', 'in', [x, y])
        .execute()
      expect(daily.map(row => ({ ...row, points: Number(row.points) }))).toEqual(
        expect.arrayContaining([
          { day: DAY, user_id: x, points: 21 },
          { day: DAY, user_id: y, points: 12 },
        ]),
      )
      expect(daily).toHaveLength(2)
    })

    it('saves a burst of rounds of different games sharing players without a deadlock or a lost update', async () => {
      const players = await freshPlayers(4)
      const saves = [createSaveRound({ games: createPgGamesRepository(dbA) }), createSaveRound({ games: createPgGamesRepository(dbB) })]
      const repo = createPgGamesRepository(dbA)
      const games = await Promise.all(Array.from({ length: 20 }, () => repo.createGame()))
      const expected = Object.fromEntries(players.map(id => [id, 0]))
      const rounds = games.map(({ id }, index) => {
        // A different rotation of the players per round, so the input orders disagree.
        const results = players.map((_, offset) => {
          const playerId = players[(index + offset) % players.length]
          const score = index * 10 + offset
          expected[playerId] += score
          return { playerId, score }
        })
        return saves[index % 2](id, crypto.randomUUID(), index % 3 === 0 ? results.reverse() : results)
      })

      for (const answer of await Promise.all(rounds)) {
        expect(answer.ok).toBe(true)
      }
      expect(await totalsOf(players)).toEqual(expected)
      expect(await dailySumsOf(players)).toEqual(expected)
    })

    it('adds a round saved from both pools at once a single time', async () => {
      const [x, y] = await freshPlayers(2)
      const { id } = await createPgGamesRepository(dbA).createGame()
      const roundId = crypto.randomUUID()
      const results = [
        { playerId: x, score: 3 },
        { playerId: y, score: 4 },
      ]
      const answers = await Promise.all([
        createSaveRound({ games: createPgGamesRepository(dbA) })(id, roundId, results),
        createSaveRound({ games: createPgGamesRepository(dbB) })(id, roundId, [...results].reverse()),
      ])
      expect(answers.map(answer => answer.ok)).toEqual([true, true])
      expect(await totalsOf([x, y])).toEqual({ [x]: 3, [y]: 4 })
      expect(await dailySumsOf([x, y])).toEqual({ [x]: 3, [y]: 4 })
    })
  })
})
