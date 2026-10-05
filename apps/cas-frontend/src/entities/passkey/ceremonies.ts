import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

import type { ErrorCodeOf, Result } from '#shared/api/client'
import type { AdditionOptionsResponse } from '#shared/api/generated/models/AdditionOptionsResponse'
import type { GetPasskeyAdditionOptionsResponses } from '#shared/api/generated/models/GetPasskeyAdditionOptions'
import type { VerifyPasskeyAdditionResponses } from '#shared/api/generated/models/VerifyPasskeyAddition'
import { getPasskeyAdditionOptions } from '#shared/api/generated/operations/getPasskeyAdditionOptions'
import { verifyPasskeyAddition } from '#shared/api/generated/operations/verifyPasskeyAddition'
import type { Passkey } from './api'

/**
 * The options as the authenticator reads them. `registrationId` names the ceremony, not the passkey, and goes back
 * with the answer; the description leaves `ccr` an `object`.
 */
type AdditionOptions = Omit<AdditionOptionsResponse, 'ccr'> & { ccr: { publicKey: PublicKeyCredentialCreationOptionsJSON } }

/** The codes `addPasskey` can fail with, from either request. */
export type AddPasskeyErrorCode = ErrorCodeOf<GetPasskeyAdditionOptionsResponses> | ErrorCodeOf<VerifyPasskeyAdditionResponses>

/**
 * The ceremony that gives the signed-in account another passkey: the server
 * issues the challenge account registration issues, with the account's
 * existing credentials in `excludeCredentials`, the authenticator makes a
 * discoverable credential, and the finish stores it under the account and
 * answers the passkey as `listPasskeys` lists it. No account is created and
 * the session stays as it is.
 *
 * Answers like `registerWithPasskey` in `#entities/session`: a failure of
 * either request comes back as the `Result` (`unauthenticated` without a
 * session, `registration_not_found`, `discoverable_credential_required`,
 * `credential_already_registered`), and an options failure is returned
 * before the authenticator is asked. Thrown: what is outside the contract
 * (no network, a 5xx) and, from the authenticator, the browser's
 * `DOMException` as `@simplewebauthn/browser` rethrows it. The
 * predicates next to that ceremony (`isCeremonyCancelled`,
 * `isPasskeyAlreadyRegistered`, ...) tell the verdicts apart here too; an
 * authenticator on the exclude list is the browser's `InvalidStateError`,
 * before any request reaches the server.
 */
export const addPasskey = async (): Promise<Result<Passkey, AddPasskeyErrorCode>> => {
  const options = await getPasskeyAdditionOptions()
  if (!options.ok) {
    return options
  }
  const { registrationId, ccr } = options.data as AdditionOptions
  const response = await startRegistration({ optionsJSON: ccr.publicKey })
  return verifyPasskeyAddition({ body: { registrationId, response } })
}
