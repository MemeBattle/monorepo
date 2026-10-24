/** A player's score in one round. */
export interface RoundResult {
  playerId: string
  score: number
}

export type WithGameResult<T> = { status: 'game_not_found' } | { status: 'ok'; value: T }

/** Whether `insertRound` wrote the round: `false` when a round with that id already existed, in any game. */
export type InsertRoundResult = { inserted: true } | { inserted: false }

/**
 * The queries of saving a round (docs/DESIGN.md § Routes), all on the transaction that holds the game's row lock.
 *
 * The callback of `withGame` issues no statement through any other handle or repository, only through this object:
 * on PGlite the transaction holds the only connection and such a statement would wait for itself forever; on Postgres
 * it would run on another connection, outside the lock and blind to the round inserted so far.
 */
export interface LockedGame {
  /**
   * The ids with no `users` row, in input order, a duplicate reported once; an empty input answers `[]`. Sees the
   * users committed before the statement.
   */
  missingPlayers(playerIds: readonly string[]): Promise<string[]>
  /** The round with this id, in whichever game owns it, with its results ordered by player id. */
  findRound(roundId: string): Promise<{ gameId: string; results: RoundResult[] } | undefined>
  /**
   * Inserts the round into this game with its results, unless a round with this id exists anywhere: then nothing is
   * written and the answer is `inserted: false`, also when a concurrent transaction of another game won the id.
   */
  insertRound(roundId: string, results: readonly RoundResult[]): Promise<InsertRoundResult>
  /** Every player of every round of this game with the sum of their scores. */
  totals(): Promise<Array<{ playerId: string; gameScore: number }>>
}

/** Games and their rounds. Queries only: conflict, repeat and unknown-player decisions belong to the use case. */
export interface GamesRepository {
  createGame(): Promise<{ id: string }>
  /**
   * Runs `fn` in one transaction with the game's row locked for its whole duration, so saves of one game are
   * serialised. Answers `game_not_found` without calling `fn` when the game does not exist. A throw in `fn` rolls
   * everything back and propagates.
   */
  withGame<T>(gameId: string, fn: (game: LockedGame) => Promise<T>): Promise<WithGameResult<T>>
}
