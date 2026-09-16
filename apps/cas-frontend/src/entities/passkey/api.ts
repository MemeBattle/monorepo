import { request } from '#shared/api/request'

/** A passkey as the dashboard shows it; the credential itself never leaves the server. */
export interface Passkey {
  id: string
  name: string
  /** RFC 3339. */
  createdAt: string
  /** RFC 3339; `null` until the passkey first signs in. */
  lastUsedAt: string | null
}

interface PasskeyListResponse {
  passkeys: Passkey[]
}

/** `GET /api/passkeys`: the signed-in account's passkeys. Throws `ApiError` `unauthenticated` without a session. */
export const listPasskeys = async (): Promise<Passkey[]> => {
  const { passkeys } = await request<PasskeyListResponse>('/api/passkeys')
  return passkeys
}
