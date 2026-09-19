import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

import { request } from '#shared/api/request'
import type { Passkey } from './api'

interface RegistrationOptionsResponse {
  /** Names the ceremony, not the passkey; goes back with the answer. */
  registrationId: string
  ccr: { publicKey: PublicKeyCredentialCreationOptionsJSON }
}

/**
 * The ceremony that gives the signed-in account another passkey: the server
 * issues the challenge account registration issues, with the account's
 * existing credentials in `excludeCredentials`, the authenticator makes a
 * discoverable credential, and the finish stores it under the account and
 * answers the passkey as `listPasskeys` lists it. No account is created and
 * the session stays as it is.
 *
 * Throws like `registerWithPasskey` in `#entities/session`: `ApiError` from
 * either request (`unauthenticated` without a session,
 * `registration_not_found`, `discoverable_credential_required`,
 * `credential_already_registered`) and, from the authenticator, the
 * browser's `DOMException` as `@simplewebauthn/browser` rethrows it. The
 * predicates next to that ceremony (`isCeremonyCancelled`,
 * `isPasskeyAlreadyRegistered`, ...) tell the verdicts apart here too; an
 * authenticator on the exclude list is the browser's `InvalidStateError`,
 * before any request reaches the server.
 */
export const addPasskey = async (): Promise<Passkey> => {
  const { registrationId, ccr } = await request<RegistrationOptionsResponse>('/api/passkeys/register-options', { method: 'POST' })
  const response = await startRegistration({ optionsJSON: ccr.publicKey })
  return request<Passkey>('/api/passkeys/verify-registration', {
    method: 'POST',
    body: { registrationId, response },
  })
}
