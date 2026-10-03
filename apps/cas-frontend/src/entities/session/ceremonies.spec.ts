import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockLoginOptions, mockLoginVerification } from './testing/stages'
import { ApiError } from '#shared/api/request'
import {
  isAuthenticatorUnsupported,
  isCeremonyCancelled,
  isPasskeyAlreadyRegistered,
  isWrongOrigin,
  signInWithPasskeyFromAutofill,
} from './ceremonies'

const { startAuthentication, browserSupportsWebAuthnAutofill, cancelCeremony } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  browserSupportsWebAuthnAutofill: vi.fn(),
  cancelCeremony: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startAuthentication,
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
