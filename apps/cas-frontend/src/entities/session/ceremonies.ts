import { WebAuthnAbortService, browserSupportsWebAuthnAutofill, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

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
  return verifyLogin(loginId, response)
}

const verifyLogin = (loginId: string, response: AuthenticationResponseJSON) =>
  request<SignedIn>('/api/webauthn/verify-login', {
    method: 'POST',
    body: { loginId, response },
  })

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

/**
 * Whether the authenticator refused to register because it already holds a
 * passkey for this account: `InvalidStateError` is its answer to a
 * credential on the `excludeCredentials` list.
 */
export const isPasskeyAlreadyRegistered = (error: unknown): boolean => nameOf(error) === 'InvalidStateError'

/**
 * Whether the authenticator cannot make the passkey CAS asks for: a
 * discoverable credential with user verification. `NotSupportedError` and
 * `ConstraintError` are the two ways the browser says so; the server says
 * the same with `discoverable_credential_required` when it finds out later.
 */
export const isAuthenticatorUnsupported = (error: unknown): boolean => {
  const name = nameOf(error)
  return name === 'NotSupportedError' || name === 'ConstraintError'
}

/**
 * Whether the page is served from an origin the relying party id does not
 * cover: `SecurityError`. A deployment mistake, not something the user can
 * fix from here, but they can be told which address to open.
 */
export const isWrongOrigin = (error: unknown): boolean => nameOf(error) === 'SecurityError'

/** What CAS puts into a challenge when the options carry no `timeout` (the webauthn-rs default). */
const DEFAULT_CHALLENGE_LIFETIME_MS = 60_000

/**
 * When to replace a challenge the autofill offer is waiting on. The server
 * keeps it a little longer than the browser's timeout, but the offer may
 * sit for minutes and the browser ignores the timeout under conditional
 * mediation; a pick against an expired challenge would fail as
 * `login_not_found`. Three quarters leaves room for the round trip.
 */
const refreshAfter = (timeoutMs = DEFAULT_CHALLENGE_LIFETIME_MS) => timeoutMs * 0.75

/**
 * The login ceremony offered through the browser's autofill (conditional
 * mediation): the request stays pending, without a click, until the user
 * picks a passkey from the autofill list under the `webauthn` input. The
 * challenge is replaced before it expires for as long as the offer stands.
 *
 * Resolves with the verified answer, or `null` when nothing was offered or
 * picked: the browser has no autofill for passkeys, the options could not
 * be fetched, `signal` was aborted (the button starts its own ceremony and
 * the two cannot run at once; leaving the screen), or the request ended as
 * `NotAllowedError`. That last one is the user backing out of the prompt
 * after a pick, but also a browser refusing conditional requests outright,
 * so it is not reported: nobody asked for anything yet, and the button is
 * the way to try again. Rejects only after a pick, like `signInWithPasskey`.
 */
export const signInWithPasskeyFromAutofill = async (signal: AbortSignal): Promise<SignedIn | null> => {
  if (signal.aborted || !(await browserSupportsWebAuthnAutofill())) {
    return null
  }
  const cancel = () => WebAuthnAbortService.cancelCeremony()
  signal.addEventListener('abort', cancel)
  try {
    while (!signal.aborted) {
      let options: LoginOptionsResponse
      try {
        options = await request<LoginOptionsResponse>('/api/webauthn/login-options', { method: 'POST' })
      } catch {
        return null
      }
      if (signal.aborted) {
        return null
      }
      let stale = false
      const refresh = setTimeout(() => {
        stale = true
        cancel()
      }, refreshAfter(options.rcr.publicKey.timeout))
      let response: AuthenticationResponseJSON
      try {
        response = await startAuthentication({ optionsJSON: options.rcr.publicKey, useBrowserAutofill: true })
      } catch (error) {
        if (signal.aborted) {
          return null
        }
        if (stale && nameOf(error) === 'AbortError') {
          continue
        }
        if (isCeremonyCancelled(error)) {
          return null
        }
        throw error
      } finally {
        clearTimeout(refresh)
      }
      return await verifyLogin(options.loginId, response)
    }
    return null
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
