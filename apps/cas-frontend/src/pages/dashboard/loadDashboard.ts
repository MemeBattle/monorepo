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
 *
 * A guest gets no passkeys and the list is not asked for: under its upgrade
 * session the call is a 401 by design (apps/cas ADR 0015 (a)) and would land
 * on the error screen. A guest has no passkey anyway.
 */
export const loadDashboard = async (): Promise<DashboardData> => {
  const me = await requireSession()
  if (me.accountType === 'guest') {
    return { me, passkeys: [] }
  }
  const passkeys = await listPasskeys()
  return { me, passkeys }
}
