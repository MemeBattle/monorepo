import type { Transaction } from 'kysely'

import type { GamesRepository, LockedGame } from '../../core/ports/games-repository'
import type { Database } from './database'
import type { DB } from './schema.generated'

/** Every query runs on `trx`, the transaction holding the game's row lock, and on nothing else. */
const lockedGame = (trx: Transaction<DB>, gameId: string): LockedGame => ({
  missingPlayers: async playerIds => {
    const ids = [...new Set(playerIds)]
    if (ids.length === 0) {
      return []
    }
    const rows = await trx.selectFrom('users').select('cas_id').where('cas_id', 'in', ids).execute()
    const found = new Set(rows.map(row => row.cas_id))
    return ids.filter(id => !found.has(id))
  },

  findRound: async roundId => {
    const round = await trx.selectFrom('rounds').select('game_id').where('id', '=', roundId).executeTakeFirst()
    if (round === undefined) {
      return undefined
    }
    const results = await trx.selectFrom('round_users').select(['user_id', 'score']).where('round_id', '=', roundId).orderBy('user_id').execute()
    return { gameId: round.game_id, results: results.map(row => ({ playerId: row.user_id, score: row.score })) }
  },

  insertRound: async (roundId, results) => {
    // A concurrent insert of the same id waits for the other transaction and then takes the DO NOTHING branch, so
    // the loser never raises a unique violation and never writes its results.
    const row = await trx
      .insertInto('rounds')
      .values({ id: roundId, game_id: gameId })
      .onConflict(oc => oc.column('id').doNothing())
      .returning('id')
      .executeTakeFirst()
    if (row === undefined) {
      return { inserted: false }
    }
    if (results.length > 0) {
      await trx
        .insertInto('round_users')
        .values(results.map(result => ({ round_id: roundId, user_id: result.playerId, score: result.score })))
        .execute()
    }
    return { inserted: true }
  },

  totals: async () => {
    const rows = await trx
      .selectFrom('round_users')
      .innerJoin('rounds', 'rounds.id', 'round_users.round_id')
      .where('rounds.game_id', '=', gameId)
      .select(eb => ['round_users.user_id', eb.fn.sum<number | string>('round_users.score').as('game_score')])
      .groupBy('round_users.user_id')
      .orderBy('round_users.user_id')
      .execute()
    // `sum` of an integer is a bigint: a string from pg, a number from PGlite.
    return rows.map(row => ({ playerId: row.user_id, gameScore: Number(row.game_score) }))
  },
})

export const createPgGamesRepository = (db: Database): GamesRepository => ({
  createGame: async () => db.insertInto('games').defaultValues().returning('id').executeTakeFirstOrThrow(),

  withGame: async (gameId, fn) =>
    db.transaction().execute(async trx => {
      const game = await trx.selectFrom('games').select('id').where('id', '=', gameId).forUpdate().executeTakeFirst()
      if (game === undefined) {
        return { status: 'game_not_found' as const }
      }
      return { status: 'ok' as const, value: await fn(lockedGame(trx, gameId)) }
    }),
})
