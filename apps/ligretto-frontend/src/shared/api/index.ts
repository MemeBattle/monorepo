import { getMe as getMeOperation, listUsers } from '@memebattle/ligretto-core-client'

import { coreClient } from './coreClient'

export type { AuthUser, GetMeStatus200 } from '@memebattle/ligretto-core-client'
export { describeFailure } from './describeFailure'

/** Who the user is, by the session cookie. Resolves to a result kind and never throws. */
export const getMe = () => getMeOperation({ client: coreClient })

/** The profiles of `ids` (1 to 100), with the access token `getMe` returned. Resolves to a result kind and never throws. */
export const getUsersByIds = (ids: string[], accessToken: string) =>
  listUsers({ client: coreClient, query: { ids }, headers: { authorization: `Bearer ${accessToken}` } })
