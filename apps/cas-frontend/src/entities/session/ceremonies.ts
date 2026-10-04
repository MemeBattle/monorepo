import { WebAuthnAbortService, browserSupportsWebAuthnAutofill, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

import type { ErrorCodeOf } from '#shared/api/client'
import type { GetLoginOptionsResponses } from '#shared/api/generated/models/GetLoginOptions'
import type { GetRegistrationOptionsResponses } from '#shared/api/generated/models/GetRegistrationOptions'
import type { LoginOptionsResponse } from '#shared/api/generated/models/LoginOptionsResponse'
import type { RegistrationOptionsResponse } from '#shared/api/generated/models/RegistrationOptionsResponse'
import type { VerifyLoginResponses } from '#shared/api/generated/models/VerifyLogin'
import type { VerifyLoginResponse } from '#shared/api/generated/models/VerifyLoginResponse'
import type { VerifyRegistrationResponses } from '#shared/api/generated/models/VerifyRegistration'
import type { VerifyRegistrationResponse } from '#shared/api/generated/models/VerifyRegistrationResponse'
import { getLoginOptions } from '#shared/api/generated/operations/getLoginOptions'
import { getRegistrationOptions } from '#shared/api/generated/operations/getRegistrationOptions'
import { verifyLogin as verifyLoginOperation } from '#shared/api/generated/operations/verifyLogin'
import { verifyRegistration } from '#shared/api/generated/operations/verifyRegistration'

/**
 * The registration options as the authenticator reads them. `registrationId` names the ceremony, not the account, and
 * goes back with the answer; the description leaves `ccr` an `object`.
 */
type RegistrationOptions = Omit<RegistrationOptionsResponse, 'ccr'> & { ccr: { publicKey: PublicKeyCredentialCreationOptionsJSON } }

export type Registered = VerifyRegistrationResponse

/** The codes `registerWithPasskey` can fail with, from either request. */
export type RegisterWithPasskeyErrorCode = ErrorCodeOf<GetRegistrationOptionsResponses> | ErrorCodeOf<VerifyRegistrationResponses>

/** The guest a registration is meant to upgrade. */
export interface Upgrading {
  accountId: string
}

/**
 * Whether a WebAuthn user handle, base64url as the options carry it, is the
 * 16 bytes of this account's UUID. Under an upgrade session CAS uses the
 * guest's id as the handle, and a fresh one for a new account (apps/cas
 * ADR 0015 (e)), so the handle says which path the backend took. Anything
 * that does not decode to 16 bytes is not the account's.
 */
export const isUserHandleOf = (handle: string, accountId: string): boolean => {
  let bytes: string
  try {
    bytes = atob(handle.replaceAll('-', '+').replaceAll('_', '/'))
  } catch {
    return false
  }
  if (bytes.length !== 16) {
    return false
  }
  const hex = Array.from(bytes, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  return hex === accountId.replaceAll('-', '').toLowerCase()
}

/** The challenge was not for the guest the screen means to upgrade (see `isNotTheGuest`). */
class NotTheGuestError extends Error {
  override name = 'NotTheGuestError'
}

/**
 * The registration ceremony: the server issues a challenge for the name, the
 * authenticator makes a discoverable credential, and the finish signs the new
 * account in by setting the session cookie. Throws `ApiError` from either
 * request and, from the authenticator, the browser's `DOMException` as
 * `@simplewebauthn/browser` rethrows it (see `isCeremonyCancelled`).
 *
 * The browser's session, not the request, decides whether CAS creates an
 * account or upgrades the guest it belongs to. With `upgrading`, the challenge
 * must be that guest's: when its user handle is another id, the upgrade
 * session has ended and the finish would create a new account, so the
 * authenticator is never asked and the call throws the error `isNotTheGuest`
 * recognises. The orphaned challenge just expires on the server.
 */
export const registerWithPasskey = async (displayName: string, upgrading?: Upgrading): Promise<Registered> => {
  const { registrationId, ccr } = (await getRegistrationOptions({ body: { displayName } })) as RegistrationOptions
  if (upgrading && !isUserHandleOf(ccr.publicKey.user.id, upgrading.accountId)) {
    throw new NotTheGuestError('The registration challenge is not for the guest being upgraded')
  }
  const response = await startRegistration({ optionsJSON: ccr.publicKey })
  return verifyRegistration({ body: { registrationId, response } })
}

/** The login options as the authenticator reads them. `loginId` names the ceremony and goes back with the assertion. */
type LoginOptions = Omit<LoginOptionsResponse, 'rcr'> & { rcr: { publicKey: PublicKeyCredentialRequestOptionsJSON } }

const fetchLoginOptions = async (): Promise<LoginOptions> => (await getLoginOptions()) as LoginOptions

export type SignedIn = VerifyLoginResponse

/** The codes `signInWithPasskey` and `signInWithPasskeyFromAutofill` can fail with, from either request. */
export type SignInWithPasskeyErrorCode = ErrorCodeOf<GetLoginOptionsResponses> | ErrorCodeOf<VerifyLoginResponses>

/**
 * The login ceremony: the server issues a challenge any registered passkey may
 * answer (nothing about the user is asked first), the authenticator signs it
 * with one, and the finish sets the session cookie. Throws like
 * `registerWithPasskey`; a passkey this CAS does not know is the `ApiError`
 * code `invalid_credential`.
 */
export const signInWithPasskey = async (): Promise<SignedIn> => {
  const { loginId, rcr } = await fetchLoginOptions()
  const response = await startAuthentication({ optionsJSON: rcr.publicKey })
  return verifyLogin(loginId, response)
}

const verifyLogin = (loginId: string, response: AuthenticationResponseJSON): Promise<SignedIn> =>
  verifyLoginOperation({ body: { loginId, response } })

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
 * Whether `registerWithPasskey` refused to upgrade because the challenge was
 * not for the guest: the browser no longer holds that guest's upgrade session.
 */
export const isNotTheGuest = (error: unknown): boolean => nameOf(error) === 'NotTheGuestError'

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
      let options: LoginOptions
      try {
        options = await fetchLoginOptions()
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
