import { queryOptions } from '@tanstack/react-query'

import { ApiError, describeFailure, getLeaders } from '#shared/api'
import type { LeadersPeriod } from '#shared/api'

export const leadersQueryKey = (period: LeadersPeriod) => ['leaders', period] as const

/**
 * The token only authorises the call, so it stays out of the key: a refetch runs the latest observer's `queryFn`, which
 * closes over the refreshed token.
 */
export const leadersQueryOptions = (period: LeadersPeriod, accessToken: string) =>
  queryOptions({
    queryKey: leadersQueryKey(period),
    queryFn: async () => {
      const result = await getLeaders(period, accessToken)
      if (result.kind !== 'success') {
        const failure = describeFailure(result)
        console.error('GET /api/leaders failed', failure)
        throw new ApiError(failure)
      }
      return result.data
    },
  })
