import { listPasskeys } from '#entities/passkey'
import type { Passkey } from '#entities/passkey'
import type { Me } from '#entities/session'
import { requireSession } from '#app/gates'

export interface DashboardData {
  me: Me
  passkeys: Passkey[]
}

/**
 * The dashboard's loader: the gate first, then what the page shows. In that
 * order on purpose: without a session both calls are a 401, and only the
 * gate's turns into the redirect to sign-in.
 */
export const loadDashboard = async (): Promise<DashboardData> => {
  const me = await requireSession()
  const passkeys = await listPasskeys()
  return { me, passkeys }
}
