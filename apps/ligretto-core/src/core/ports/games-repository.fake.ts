import type { GamesRepository, LockedGame, RoundResult } from './games-repository'
import { createFakeUsersRepository } from './users-repository.fake'
import type { FakeUsersRepository } from './users-repository.fake'

type StoredRound = { gameId: string; results: RoundResult[] }

export type FakeGamesRepository = GamesRepository & {
  /** The committed games, for assertions. */
  games: Set<string>
  /** The committed rounds by id, for assertions. */
  rounds: Map<string, StoredRound>
}

const byPlayerId = (a: RoundResult, b: RoundResult) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

/**
 * The in-memory `GamesRepository`. Players exist when `users` has them, so a use-case test seeds one users fake and
 * hands it to both repositories; without one, every player is unknown. `withGame` runs one game's callbacks one after
 * another and keeps a callback's inserts private until it resolves, so a throw leaves nothing behind.
 *
 * Round ids are unique across games, as the primary key makes them in Postgres: a round id another game's callback has
 * inserted but not yet committed is reserved, and a second insert of it waits for that callback to settle, then
 * answers `inserted: false` when it committed and inserts when it threw. Two callbacks that each wait for the other's
 * round id would hang here where Postgres reports a deadlock; a test must not set that up.
 */
export const createFakeGamesRepository = (users: Pick<FakeUsersRepository, 'has'> = createFakeUsersRepository()): FakeGamesRepository => {
  const games = new Set<string>()
  const rounds = new Map<string, StoredRound>()
  /** The tail of each game's queue of callbacks. */
  const queues = new Map<string, Promise<unknown>>()
  /** Round ids staged by a callback that has not settled yet, each with the promise that resolves when it does. */
  const reservations = new Map<string, Promise<void>>()

  const lockedGame = (gameId: string, staged: Map<string, StoredRound>, settled: Promise<void>): LockedGame => {
    const find = (roundId: string) => staged.get(roundId) ?? rounds.get(roundId)
    return {
      missingPlayers: async playerIds => [...new Set(playerIds)].filter(id => !users.has(id)),
      findRound: async roundId => {
        const round = find(roundId)
        return round && { gameId: round.gameId, results: [...round.results].sort(byPlayerId) }
      },
      insertRound: async (roundId, results) => {
        if (find(roundId) !== undefined) {
          return { inserted: false }
        }
        // Another game's callback holds the id: wait for it to commit or roll back, as the unique index makes Postgres.
        for (let held = reservations.get(roundId); held !== undefined && held !== settled; held = reservations.get(roundId)) {
          await held
          if (rounds.has(roundId)) {
            return { inserted: false }
          }
        }
        const unknown = results.find(result => !users.has(result.playerId))
        if (unknown !== undefined) {
          throw new Error(`unknown player ${unknown.playerId}`)
        }
        staged.set(roundId, { gameId, results: results.map(result => ({ ...result })) })
        reservations.set(roundId, settled)
        return { inserted: true }
      },
      totals: async () => {
        const sums = new Map<string, number>()
        for (const round of [...rounds.values(), ...staged.values()]) {
          if (round.gameId === gameId) {
            for (const { playerId, score } of round.results) {
              sums.set(playerId, (sums.get(playerId) ?? 0) + score)
            }
          }
        }
        return [...sums].map(([playerId, gameScore]) => ({ playerId, gameScore }))
      },
    }
  }

  return {
    games,
    rounds,
    createGame: async () => {
      const id = crypto.randomUUID()
      games.add(id)
      return { id }
    },
    withGame: async (gameId, fn) => {
      const held = queues.get(gameId)
      const run = (async () => {
        await held?.catch(() => undefined)
        if (!games.has(gameId)) {
          return { status: 'game_not_found' as const }
        }
        const staged = new Map<string, StoredRound>()
        let settle = () => {}
        const settled = new Promise<void>(resolve => {
          settle = resolve
        })
        try {
          const value = await fn(lockedGame(gameId, staged, settled))
          for (const [roundId, round] of staged) {
            // The reservation already kept every other writer off these ids; never overwrite a committed round.
            if (!rounds.has(roundId)) {
              rounds.set(roundId, round)
            }
          }
          return { status: 'ok' as const, value }
        } finally {
          for (const roundId of staged.keys()) {
            if (reservations.get(roundId) === settled) {
              reservations.delete(roundId)
            }
          }
          settle()
        }
      })()
      const queued = run.catch(() => undefined)
      queues.set(gameId, queued)
      try {
        return await run
      } finally {
        if (queues.get(gameId) === queued) {
          queues.delete(gameId)
        }
      }
    },
  }
}
