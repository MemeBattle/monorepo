import type { Leader, LeadersRepository } from './leaders-repository.ts'

type RankQuery = Parameters<LeadersRepository['rank']>[0]

export type FakeLeadersRepository = LeadersRepository & {
  /** Every query received, in order, for assertions. */
  queries: RankQuery[]
}

/**
 * A `LeadersRepository` that records each query and answers `answer` to all of them. The ranking itself is SQL and
 * is proven on PGlite; this lets the use case and the route be tested without it.
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
