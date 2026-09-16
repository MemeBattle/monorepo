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
 * request and, from the authenticator, the browser's `DOMException` as
 * `@simplewebauthn/browser` rethrows it (see `isCeremonyCancelled`).
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

/**
 * The name of a thrown error, whatever realm it came from. `instanceof` is
 * not used: `@simplewebauthn/browser` rethrows a `DOMException` as its own
 * `WebAuthnError` that keeps the name and carries the original as `cause`,
 * and under jsdom a `DOMException` is not an instance of the test runner's
 * `Error`.
 */
const nameOf = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : null

/**
 * Whether a ceremony ended without an answer: `NotAllowedError` is the
 * browser's word for the user closing the prompt or the timeout running
 * out. Nothing is broken and the same ceremony can simply be started again;
 * what to say about it is the screen's business.
 */
export const isCeremonyCancelled = (error: unknown): boolean => nameOf(error) === 'NotAllowedError'
