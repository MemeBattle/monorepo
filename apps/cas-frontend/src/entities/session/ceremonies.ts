import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

import { request } from '#shared/api/request'

interface RegistrationOptionsResponse {
  /** Names the ceremony, not the account; goes back with the answer. */
  registrationId: string
  ccr: { publicKey: PublicKeyCredentialCreationOptionsJSON }
}

export interface Registered {
  accountId: string
  credentialId: string
}

/**
 * The registration ceremony: the server issues a challenge for the name, the
 * authenticator makes a discoverable credential, and the finish signs the new
 * account in by setting the session cookie. Throws `ApiError` from either
 * request and the browser's `DOMException` from the authenticator.
 */
export const registerWithPasskey = async (displayName: string): Promise<Registered> => {
  const { registrationId, ccr } = await request<RegistrationOptionsResponse>('/api/webauthn/register-options', {
    method: 'POST',
    body: { displayName },
  })
  const response = await startRegistration({ optionsJSON: ccr.publicKey })
  return request<Registered>('/api/webauthn/verify-registration', {
    method: 'POST',
    body: { registrationId, response },
  })
}
