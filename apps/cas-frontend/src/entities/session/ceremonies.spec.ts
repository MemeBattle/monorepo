import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockLoginOptions, mockLoginVerification, mockRegistrationOptions, mockRegistrationVerification } from './testing/stages'
import { ApiError } from '#shared/api/request'
import {
  isAuthenticatorUnsupported,
  isCeremonyCancelled,
  isNotTheGuest,
  isPasskeyAlreadyRegistered,
  isUserHandleOf,
  isWrongOrigin,
  registerWithPasskey,
  signInWithPasskeyFromAutofill,
} from './ceremonies'

const { startAuthentication, startRegistration, browserSupportsWebAuthnAutofill, cancelCeremony } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthnAutofill: vi.fn(),
  cancelCeremony: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthnAutofill,
  WebAuthnAbortService: { cancelCeremony, createNewAbortSignal: vi.fn() },
}))

const notAllowed = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')

describe('isCeremonyCancelled', () => {
  it('recognises the browser’s NotAllowedError', () => {
    expect(isCeremonyCancelled(notAllowed())).toBe(true)
  })

  it('sees through the wrapper @simplewebauthn/browser puts around it', () => {
    const cause = notAllowed()
    const wrapped = new WebAuthnError({ message: cause.message, code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause })

    expect(isCeremonyCancelled(wrapped)).toBe(true)
  })

  it('is false for everything else', () => {
    for (const error of [
      new DOMException('bad origin', 'SecurityError'),
      new ApiError(404, 'registration_not_found', ''),
      new TypeError('Failed to fetch'),
      'NotAllowedError',
      null,
    ]) {
      expect(isCeremonyCancelled(error)).toBe(false)
    }
  })
})

describe('the other verdicts of the authenticator', () => {
  const named = (name: string) => new DOMException(`the browser said ${name}`, name)
  const wrapped = (name: string) => new WebAuthnError({ message: 'wrapped', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause: named(name) })

  it('tells a passkey the authenticator already holds', () => {
    expect(isPasskeyAlreadyRegistered(named('InvalidStateError'))).toBe(true)
    expect(isPasskeyAlreadyRegistered(wrapped('InvalidStateError'))).toBe(true)
    expect(isPasskeyAlreadyRegistered(named('NotAllowedError'))).toBe(false)
  })

  it('tells an authenticator that cannot make a discoverable credential', () => {
    expect(isAuthenticatorUnsupported(named('NotSupportedError'))).toBe(true)
    expect(isAuthenticatorUnsupported(named('ConstraintError'))).toBe(true)
    expect(isAuthenticatorUnsupported(wrapped('ConstraintError'))).toBe(true)
    expect(isAuthenticatorUnsupported(named('NotAllowedError'))).toBe(false)
  })

  it('tells a page served from the wrong origin', () => {
    expect(isWrongOrigin(named('SecurityError'))).toBe(true)
    expect(isWrongOrigin(wrapped('SecurityError'))).toBe(true)
    expect(isWrongOrigin(new TypeError('Failed to fetch'))).toBe(false)
  })
})

/** The guest's id and its WebAuthn user handle: the UUID's 16 bytes, base64url without padding. */
const guestId = '0191e2a4-5b6c-7d8e-9fa0-b1c2d3e4f506'
const guestHandle = 'AZHipFtsfY6foLHC0-T1Bg'
const anotherHandle = 'ESIzRFVmd4iZqrvM3e7_AA'

describe('isUserHandleOf', () => {
  it('matches the handle that is the account’s UUID', () => {
    expect(isUserHandleOf(guestHandle, guestId)).toBe(true)
    expect(isUserHandleOf(guestHandle, guestId.toUpperCase())).toBe(true)
  })

  it('does not match another id', () => {
    expect(isUserHandleOf(anotherHandle, guestId)).toBe(false)
  })

  it.each([
    ['shorter than 16 bytes', 'AZHipFtsfY6foLHC0-T1'],
    ['longer than 16 bytes', 'AZHipFtsfY6foLHC0-T1BgAA'],
    ['not base64url', '!!not base64!!'],
    ['empty', ''],
  ])('does not match a handle %s', (_, handle) => {
    expect(isUserHandleOf(handle, guestId)).toBe(false)
  })
})

describe('registerWithPasskey', () => {
  const options = (userId: string) => ({
    registrationId: 'r1',
    ccr: { publicKey: { challenge: 'c', user: { id: userId, name: 'Ада', displayName: 'Ада' } } },
  })
  const made = { id: 'cred', rawId: 'cred', response: {}, type: 'public-key', clientExtensionResults: {} }
  const registered = { accountId: guestId, credentialId: 'cred' }

  afterEach(() => {
    startRegistration.mockReset()
  })

  it('upgrades when the challenge is the guest’s', async () => {
    mockRegistrationOptions(options(guestHandle))
    const verified = mockRegistrationVerification(registered)
    startRegistration.mockResolvedValue(made)

    await expect(registerWithPasskey('Ада', { accountId: guestId })).resolves.toEqual(registered)

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options(guestHandle).ccr.publicKey })
    expect(verified).toHaveBeenCalledExactlyOnceWith({ registrationId: 'r1', response: made })
  })

  it('never asks the authenticator when the challenge is for someone else', async () => {
    // What CAS answers once the upgrade session is gone: an ordinary challenge with a fresh handle.
    const requested = mockRegistrationOptions(options(anotherHandle))
    const verified = mockRegistrationVerification()

    await expect(registerWithPasskey('Ада', { accountId: guestId })).rejects.toSatisfy(isNotTheGuest)

    expect(startRegistration).not.toHaveBeenCalled()
    expect(requested).toHaveBeenCalledOnce()
    expect(verified).not.toHaveBeenCalled()
  })

  it('does not look at the handle of a plain registration', async () => {
    mockRegistrationOptions(options(anotherHandle))
    mockRegistrationVerification(registered)
    startRegistration.mockResolvedValue(made)

    await expect(registerWithPasskey('Ада')).resolves.toEqual(registered)

    expect(startRegistration).toHaveBeenCalledOnce()
  })

  it('is the only error isNotTheGuest recognises', () => {
    expect(isNotTheGuest(notAllowed())).toBe(false)
    expect(isNotTheGuest(new ApiError(404, 'registration_not_found', ''))).toBe(false)
  })
})

describe('signInWithPasskeyFromAutofill', () => {
  const options = (loginId: string) => ({ loginId, rcr: { publicKey: { challenge: 'c', timeout: 60_000 } } })
  const picked = { id: 'cred', rawId: 'cred', response: {}, type: 'public-key', clientExtensionResults: {} }
  const signedIn = { accountId: 'acc', credentialId: 'cred' }

  /** What `@simplewebauthn/browser` throws from a cancelled ceremony: its abort error, wrapped. */
  const aborted = () => {
    const cause = new Error('Manually cancelling existing WebAuthn API call')
    cause.name = 'AbortError'
    return new WebAuthnError({ message: 'Authentication ceremony was sent an abort signal', code: 'ERROR_CEREMONY_ABORTED', cause })
  }

  /** An offer nobody has answered yet; cancelling the ceremony is how the browser ends it. */
  const pendingOffer = () =>
    new Promise<never>((_, reject) => {
      cancelCeremony.mockImplementationOnce(() => reject(aborted()))
    })

  let requested: ReturnType<typeof mockLoginOptions>
  const loginOptionsCalls = () => requested.mock.calls.length

  beforeEach(() => {
    vi.useFakeTimers()
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)
    requested = mockLoginOptions()
  })

  afterEach(() => {
    vi.useRealTimers()
    startAuthentication.mockReset()
    browserSupportsWebAuthnAutofill.mockReset()
    cancelCeremony.mockReset()
  })

  it('offers nothing in a browser without passkey autofill', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(false)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    expect(requested).not.toHaveBeenCalled()
  })

  it('verifies the passkey the user picked', async () => {
    requested = mockLoginOptions(options('l1'))
    const verified = mockLoginVerification(signedIn)
    startAuthentication.mockResolvedValue(picked)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toEqual(signedIn)

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: options('l1').rcr.publicKey, useBrowserAutofill: true })
    expect(verified).toHaveBeenCalledExactlyOnceWith({ loginId: 'l1', response: picked })
  })

  it('replaces the challenge before it expires while the offer stands', async () => {
    let count = 0
    requested = mockLoginOptions.respond(() => options(`l${++count}`))
    const verified = mockLoginVerification(signedIn)
    startAuthentication.mockReturnValueOnce(pendingOffer()).mockResolvedValueOnce(picked)

    const outcome = signInWithPasskeyFromAutofill(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(44_000)
    expect(loginOptionsCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(outcome).resolves.toEqual(signedIn)
    expect(loginOptionsCalls()).toBe(2)
    expect(verified).toHaveBeenCalledExactlyOnceWith({ loginId: 'l2', response: picked })
  })

  it('withdraws the offer when the signal is aborted and asks for nothing more', async () => {
    requested = mockLoginOptions(options('l1'))
    startAuthentication.mockReturnValueOnce(pendingOffer())
    const controller = new AbortController()

    const outcome = signInWithPasskeyFromAutofill(controller.signal)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await expect(outcome).resolves.toBeNull()
    expect(cancelCeremony).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(loginOptionsCalls()).toBe(1)
  })

  it('offers nothing when the options cannot be fetched', async () => {
    mockLoginOptions.networkError()

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    expect(startAuthentication).not.toHaveBeenCalled()
  })

  it('ends the offer quietly when the browser refuses it or the user backs out of the pick', async () => {
    requested = mockLoginOptions(options('l1'))
    startAuthentication.mockRejectedValueOnce(notAllowed())

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(loginOptionsCalls()).toBe(1)
  })

  it('reports a failure after the pick, as the button would', async () => {
    requested = mockLoginOptions(options('l1'))
    mockLoginVerification.error('invalid_credential')
    startAuthentication.mockResolvedValue(picked)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).rejects.toSatisfy(
      error => error instanceof ApiError && error.code === 'invalid_credential',
    )
  })
})
