import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

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

interface LoginOptionsResponse {
  /** Names the ceremony; goes back with the assertion. */
  loginId: string
  rcr: { publicKey: PublicKeyCredentialRequestOptionsJSON }
}

export interface SignedIn {
  accountId: string
  credentialId: string
}

/**
 * The login ceremony: the server issues a challenge any registered passkey may
 * answer (nothing about the user is asked first), the authenticator signs it
 * with one, and the finish sets the session cookie. Throws like
 * `registerWithPasskey`; a passkey this CAS does not know is the `ApiError`
 * code `invalid_credential`.
 */
export const signInWithPasskey = async (): Promise<SignedIn> => {
  const { loginId, rcr } = await request<LoginOptionsResponse>('/api/webauthn/login-options', { method: 'POST' })
  const response = await startAuthentication({ optionsJSON: rcr.publicKey })
  return request<SignedIn>('/api/webauthn/verify-login', {
    method: 'POST',
    body: { loginId, response },
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
