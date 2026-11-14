import { createQueryClient } from '#shared/api'
import type { Leader, Leaderboard, LeadersPeriod } from '#shared/api'

import { leadersQueryKey } from '../../model/leadersQuery'

const leader = (sub: string, name: string | null, totalPoints: number, place: number): Leader => ({ sub, name, avatarUrl: null, totalPoints, place })

const me = leader('me', 'Miles Cummerata', 120, 15)

const leaderboardFixtures: Record<LeadersPeriod, Leaderboard> = {
  day: {
    leaders: [
      leader('a', 'Terry Medhurst', 2000, 1),
      leader('b', 'Sheldon Quigley', 1950, 2),
      leader('c', null, 1950, 2),
      leader('d', 'Wolfeschlegelsteinhausenbergerdorff_the_Magnificent', 1700, 4),
      leader('e', 'Terrill Hills', 1650, 5),
    ],
    me,
  },
  month: {
    leaders: [
      leader('f', 'Mavis Schultz', 9000, 1),
      leader('g', 'Alison Reichert', 8700, 2),
      leader('me', 'Miles Cummerata', 8100, 3),
      leader('h', 'Oleta Abbott', 7900, 4),
    ],
    me: leader('me', 'Miles Cummerata', 8100, 3),
  },
  all: { leaders: [], me: null },
}

/** A query client holding the fixtures as fresh data, so a story never fetches. */
export const createSeededQueryClient = () => {
  const queryClient = createQueryClient()
  queryClient.setQueryDefaults(['leaders'], { staleTime: Infinity })
  for (const [period, leaderboard] of Object.entries(leaderboardFixtures)) {
    queryClient.setQueryData(leadersQueryKey(period as LeadersPeriod), leaderboard)
  }
  return queryClient
}
