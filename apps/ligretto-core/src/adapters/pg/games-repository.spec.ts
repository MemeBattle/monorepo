import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../../test/support/pglite'
import { seedUsers } from '../../../test/support/seed'
import type { GamesRepository, RoundResult } from '../../core/ports/games-repository'
import { createFakeGamesRepository } from '../../core/ports/games-repository.fake'
import { createFakeUsersRepository } from '../../core/ports/users-repository.fake'
import { createPgGamesRepository } from './games-repository'

/** One implementation under the contract, with what the assertions need to look behind it. */
type Subject = {
  repo: GamesRepository
  seedPlayers(ids: string[]): Promise<void>
  gameExists(id: string): Promise<boolean>
  roundExists(id: string): Promise<boolean>
  roundUserCount(): Promise<number>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let database: Awaited<ReturnType<typeof createTestDatabase>>

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  await database.close()
})

const pgSubject = async (): Promise<Subject> => {
  const { db } = database
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

  it('leaves nothing behind when the callback throws after inserting', async () => {
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    const rejection = new Error('unknown_players')
    await expect(
      subject.repo.withGame(id, async game => {
        expect(await game.insertRound(roundId, [{ playerId: 'alice', score: 3 }])).toEqual({ inserted: true })
        expect(await game.missingPlayers(['alice', 'ghost'])).toEqual(['ghost'])
        throw rejection
      }),
    ).rejects.toBe(rejection)
    expect(await subject.roundExists(roundId)).toBe(false)
    expect(await subject.roundUserCount()).toBe(0)
  })

  it('inserts a round once and answers inserted: false on a repeat', async () => {
    const { id } = await subject.repo.createGame()
    const roundId = crypto.randomUUID()
    const results: RoundResult[] = [
      { playerId: 'alice', score: 3 },
      { playerId: 'bob', score: 1 },
    ]
    expect(await onGame(subject.repo, id, game => game.insertRound(roundId, results))).toEqual({ inserted: true })
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
