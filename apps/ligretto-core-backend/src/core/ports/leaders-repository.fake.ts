import type { Leader, LeadersRepository } from './leaders-repository.ts'

type RankQuery = Parameters<LeadersRepository['rank']>[0]

export type FakeLeadersRepository = LeadersRepository & {
  /** Every query received, in order, for assertions. */
  queries: RankQuery[]
}

/**
 * A `LeadersRepository` that records each query and answers `answer` to all of them. The ranking is SQL, tested on
 * PGlite; this fake tests the use case and the route without a database.
 */
export const createFakeLeadersRepository = (
  answer: { top: Leader[]; viewer: Leader | undefined } = { top: [], viewer: undefined },
): FakeLeadersRepository => {
  const queries: RankQuery[] = []
  return {
    queries,
    rank: async query => {
      queries.push(query)
      return answer
    },
  }
}
