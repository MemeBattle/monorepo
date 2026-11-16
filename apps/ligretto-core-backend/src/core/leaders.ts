import type { Clock } from './ports/clock.ts'
import type { Leader, LeaderboardWindow, LeadersRepository } from './ports/leaders-repository.ts'
import { daysBefore, leaderboardDay } from './leaderboard-day.ts'

export type LeaderPeriod = 'day' | 'month' | 'all'

/** The month of the leaderboard: today and the 29 days before it. */
const MONTH_DAYS = 30

const windowOf = (period: LeaderPeriod, today: string): LeaderboardWindow => {
  switch (period) {
    case 'day':
      return { from: today, to: today }
    case 'month':
      return { from: daysBefore(today, MONTH_DAYS - 1), to: today }
    case 'all':
      return 'all'
  }
}

/**
 * The leaderboard of `GET /api/leaders` (docs/DESIGN.md § Routes): the first `limit` full accounts by points in the
 * period, and the viewer's own row wherever it ranks. Today is the `Europe/Berlin` date of `clock`.
 */
export const createListLeaders =
  ({ leaders, clock, limit }: { leaders: LeadersRepository; clock: Clock; limit: number }) =>
  async (period: LeaderPeriod, viewer: string): Promise<{ leaders: Leader[]; me: Leader | null }> => {
    const window = windowOf(period, leaderboardDay(clock.now()))
    const { top, viewer: row } = await leaders.rank({ window, limit, viewer })
    return { leaders: top, me: row ?? null }
  }
