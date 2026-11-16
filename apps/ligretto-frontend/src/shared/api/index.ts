import { getMe as getMeOperation, listLeaders, listUsers } from '@memebattle/ligretto-core-client'
import type { ListLeadersQuery } from '@memebattle/ligretto-core-client'

import { coreClient } from './coreClient'

export type { AuthUser, GetMeStatus200, Leader, Leaderboard } from '@memebattle/ligretto-core-client'
export { describeFailure } from './describeFailure'
export { ApiError } from './ApiError'
export { createQueryClient } from './queryClient'

export type LeadersPeriod = ListLeadersQuery['period']

/** Who the user is, by the session cookie. Resolves to a result kind and never throws. */
export const getMe = () => getMeOperation({ client: coreClient })

/** The profiles of `ids` (1 to 100), with the access token `getMe` returned. Resolves to a result kind and never throws. */
export const getUsersByIds = (ids: string[], accessToken: string) =>
  listUsers({ client: coreClient, query: { ids }, headers: { authorization: `Bearer ${accessToken}` } })

/** The ranking of `period` and the caller's own row, with the access token `getMe` returned. Resolves to a result kind and never throws. */
export const getLeaders = (period: LeadersPeriod, accessToken: string) =>
  listLeaders({ client: coreClient, query: { period }, headers: { authorization: `Bearer ${accessToken}` } })
