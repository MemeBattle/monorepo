/** The days to sum, `YYYY-MM-DD` and inclusive at both ends, or every recorded round. */
export type LeaderboardWindow = { from: string; to: string } | 'all'

/** One ranked player: their latest profile snapshot, their points in the window and their place. */
export interface Leader {
  sub: string
  displayName: string | null
  avatarUrl: string | null
  points: number
  place: number
}

/** The leaderboard points of docs/adrs/leaderboard-points-aggregated-on-write.md, ranked. */
export interface LeadersRepository {
  /**
   * Ranks the full accounts with points in `window`; a guest is neither listed nor takes a place. `place` is the
   * standard competition rank by points (1, 2, 2, 4). The order is points descending, then display name ascending with
   * the nameless last, then sub; `top` is the first `limit` players of that order. `viewer` is that subject's row with
   * its place wherever it ranks, or `undefined` when they are not ranked.
   */
  rank(query: { window: LeaderboardWindow; limit: number; viewer: string }): Promise<{ top: Leader[]; viewer: Leader | undefined }>
}
