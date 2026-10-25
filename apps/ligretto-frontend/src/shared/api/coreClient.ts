import { createClient } from '@memebattle/ligretto-core-client'

import { LIGRETTO_CORE_URL } from '#shared/constants/config'

// `include`: the session is a cookie on the API origin, cross-origin in development.
export const coreClient = createClient({ baseUrl: LIGRETTO_CORE_URL, credentials: 'include' })
