// What PGlite cannot show: the row lock, the round-id race between games and READ COMMITTED visibility, on a real
// Postgres with two independent pools.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../../src/adapters/pg/database.ts'
import { createPgGamesRepository } from '../../src/adapters/pg/games-repository.ts'
import { upsertUser } from '../../src/adapters/pg/users-repository.ts'
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

    expect(await a).toEqual({ status: 'ok', value: { inserted: true } })
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
})
