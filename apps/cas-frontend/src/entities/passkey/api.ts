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

/**
 * `PATCH /api/passkeys/{id}`: gives one of the account's passkeys a new name
 * and answers the passkey as it now is. The server judges the name and
 * throws `ApiError` `invalid_passkey_name` for an empty, over-long or
 * invisible one; a passkey that is not the account's is `passkey_not_found`,
 * whoever it belongs to.
 */
export const renamePasskey = (id: string, name: string): Promise<Passkey> =>
  request<Passkey>(`/api/passkeys/${id}`, { method: 'PATCH', body: { name } })
