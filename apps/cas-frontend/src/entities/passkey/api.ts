import type { ErrorCodeOf } from '#shared/api/client'
import type { DeletePasskeyResponses } from '#shared/api/generated/models/DeletePasskey'
import type { ListPasskeysResponses } from '#shared/api/generated/models/ListPasskeys'
import type { PasskeyResponse } from '#shared/api/generated/models/PasskeyResponse'
import type { RenamePasskeyResponses } from '#shared/api/generated/models/RenamePasskey'
import { deletePasskey as deletePasskeyOperation } from '#shared/api/generated/operations/deletePasskey'
import { listPasskeys as listPasskeysOperation } from '#shared/api/generated/operations/listPasskeys'
import { renamePasskey as renamePasskeyOperation } from '#shared/api/generated/operations/renamePasskey'

/** A passkey as the dashboard shows it; the credential itself never leaves the server. */
export type Passkey = PasskeyResponse

/** The codes `listPasskeys` can fail with. */
export type ListPasskeysErrorCode = ErrorCodeOf<ListPasskeysResponses>

/** The codes `renamePasskey` can fail with. */
export type RenamePasskeyErrorCode = ErrorCodeOf<RenamePasskeyResponses>

/** The codes `deletePasskey` can fail with. */
export type DeletePasskeyErrorCode = ErrorCodeOf<DeletePasskeyResponses>

/** `GET /api/passkeys`: the signed-in account's passkeys. Throws `ApiError` `unauthenticated` without a session. */
export const listPasskeys = async (): Promise<Passkey[]> => {
  const { passkeys } = await listPasskeysOperation()
  return passkeys
}

/**
 * `PATCH /api/passkeys/{id}`: gives one of the account's passkeys a new name
 * and answers the passkey as it now is. The server judges the name and
 * throws `ApiError` `invalid_passkey_name` for an empty, over-long or
 * invisible one; a passkey that is not the account's is `passkey_not_found`,
 * whoever it belongs to.
 */
export const renamePasskey = (id: string, name: string): Promise<Passkey> => renamePasskeyOperation({ path: { id }, body: { name } })

/**
 * `DELETE /api/passkeys/{id}`: removes one of the account's passkeys; the
 * sessions it opened carry on. The account's only passkey stays: that is
 * `ApiError` `last_passkey`, and the same request goes through once there
 * is another one. A passkey that is not the account's is `passkey_not_found`.
 */
export const deletePasskey = async (id: string): Promise<void> => {
  await deletePasskeyOperation({ path: { id } })
}
