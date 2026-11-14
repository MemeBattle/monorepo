import type { Clock } from './clock.ts'
import { createFixedClock } from './clock.fake.ts'
import type { GamesRepository, LockedGame, RoundResult } from './games-repository.ts'
import { createFakeUsersRepository } from './users-repository.fake.ts'
import type { FakeUsersRepository } from './users-repository.fake.ts'

type StoredRound = { gameId: string; results: RoundResult[] }

export type FakeGamesRepository = GamesRepository & {
  /** The committed games, for assertions. */
  games: Set<string>
  /** The committed rounds by id, for assertions. */
  rounds: Map<string, StoredRound>
  /** The committed leaderboard points per day and player, keyed `${day} ${playerId}`, for assertions. */
  dailyPoints: Map<string, number>
  /** The committed all-time leaderboard points per player, for assertions. */
  totalPoints: Map<string, number>
}

/** Leaderboard points written by one callback, kept apart until it resolves. */
type StagedPoints = { daily: Map<string, number>; totals: Map<string, number> }

const add = (points: Map<string, number>, key: string, score: number) => {
  points.set(key, (points.get(key) ?? 0) + score)
}

const byPlayerId = (a: RoundResult, b: RoundResult) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

/**
 * The in-memory `GamesRepository`. Players exist when `users` has them, so a use-case test seeds one users fake and
 * hands it to both repositories; without one, every player is unknown. `withGame` runs one game's callbacks one after
 * another and keeps a callback's inserts and points private until it resolves, so a throw leaves nothing behind. An
 * inserted round's `createdAt` is `clock`'s time at the insert.
 *
 * Round ids are unique across games, as the primary key makes them in Postgres: a round id another game's callback has
 * inserted but not yet committed is reserved, and a second insert of it waits for that callback to settle, then
 * answers `inserted: false` when it committed and inserts when it threw. Two callbacks that each wait for the other's
 * round id would hang here where Postgres reports a deadlock; a test must not set that up.
 */
export const createFakeGamesRepository = (
  users: Pick<FakeUsersRepository, 'has'> = createFakeUsersRepository(),
  clock: Clock = createFixedClock(),
): FakeGamesRepository => {
  const games = new Set<string>()
  const rounds = new Map<string, StoredRound>()
  const dailyPoints = new Map<string, number>()
  const totalPoints = new Map<string, number>()
  /** The tail of each game's queue of callbacks. */
  const queues = new Map<string, Promise<unknown>>()
  /** Round ids staged by a callback that has not settled yet, each with the promise that resolves when it does. */
  const reservations = new Map<string, Promise<void>>()

  const lockedGame = (gameId: string, staged: Map<string, StoredRound>, stagedPoints: StagedPoints, settled: Promise<void>): LockedGame => {
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
          // Recheck staged rounds too: another insert of this callback may have staged the id while this one waited.
          if (find(roundId) !== undefined) {
            return { inserted: false }
          }
        }
        const unknown = results.find(result => !users.has(result.playerId))
        if (unknown !== undefined) {
          throw new Error(`unknown player ${unknown.playerId}`)
        }
        staged.set(roundId, { gameId, results: results.map(result => ({ ...result })) })
        reservations.set(roundId, settled)
        return { inserted: true, createdAt: new Date(clock.now()) }
      },
      addPoints: async (day, results) => {
        const unknown = results.find(result => !users.has(result.playerId))
        if (unknown !== undefined) {
          throw new Error(`unknown player ${unknown.playerId}`)
        }
        for (const { playerId, score } of results) {
          add(stagedPoints.daily, `${day} ${playerId}`, score)
          add(stagedPoints.totals, playerId, score)
        }
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
      // Both maps keep insertion order, and staged rounds were inserted after every committed one.
      latestRoundResults: async () => [...rounds.values(), ...staged.values()].filter(round => round.gameId === gameId).at(-1)?.results ?? [],
    }
  }

  return {
    games,
    rounds,
    dailyPoints,
    totalPoints,
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
        const stagedPoints: StagedPoints = { daily: new Map(), totals: new Map() }
        let settle = () => {}
        const settled = new Promise<void>(resolve => {
          settle = resolve
        })
        try {
          const value = await fn(lockedGame(gameId, staged, stagedPoints, settled))
          for (const [roundId, round] of staged) {
            // The reservation already kept every other writer off these ids; never overwrite a committed round.
            if (!rounds.has(roundId)) {
              rounds.set(roundId, round)
            }
          }
          for (const [key, points] of stagedPoints.daily) {
            add(dailyPoints, key, points)
          }
          for (const [playerId, points] of stagedPoints.totals) {
            add(totalPoints, playerId, points)
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
