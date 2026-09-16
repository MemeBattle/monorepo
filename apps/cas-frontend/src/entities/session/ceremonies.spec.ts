import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { isCeremonyCancelled, signInWithPasskeyFromAutofill } from './ceremonies'

const { request, startAuthentication, browserSupportsWebAuthnAutofill, cancelCeremony } = vi.hoisted(() => ({
  request: vi.fn(),
  startAuthentication: vi.fn(),
  browserSupportsWebAuthnAutofill: vi.fn(),
  cancelCeremony: vi.fn(),
}))
vi.mock('#shared/api/request', async importOriginal => ({ ...(await importOriginal<typeof import('#shared/api/request')>()), request }))
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

  const loginOptionsCalls = () => request.mock.calls.filter(([path]) => path === '/api/webauthn/login-options').length

  beforeEach(() => {
    vi.useFakeTimers()
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    request.mockReset()
    startAuthentication.mockReset()
    browserSupportsWebAuthnAutofill.mockReset()
    cancelCeremony.mockReset()
  })

  it('offers nothing in a browser without passkey autofill', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(false)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    expect(request).not.toHaveBeenCalled()
  })

  it('verifies the passkey the user picked', async () => {
    request.mockResolvedValueOnce(options('l1')).mockResolvedValueOnce(signedIn)
    startAuthentication.mockResolvedValue(picked)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toEqual(signedIn)

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: options('l1').rcr.publicKey, useBrowserAutofill: true })
    expect(request).toHaveBeenLastCalledWith('/api/webauthn/verify-login', { method: 'POST', body: { loginId: 'l1', response: picked } })
  })

  it('replaces the challenge before it expires while the offer stands', async () => {
    request.mockResolvedValueOnce(options('l1')).mockResolvedValueOnce(options('l2')).mockResolvedValueOnce(signedIn)
    startAuthentication.mockReturnValueOnce(pendingOffer()).mockResolvedValueOnce(picked)

    const outcome = signInWithPasskeyFromAutofill(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(44_000)
    expect(loginOptionsCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(outcome).resolves.toEqual(signedIn)
    expect(loginOptionsCalls()).toBe(2)
    expect(request).toHaveBeenLastCalledWith('/api/webauthn/verify-login', { method: 'POST', body: { loginId: 'l2', response: picked } })
  })

  it('withdraws the offer when the signal is aborted and asks for nothing more', async () => {
    request.mockResolvedValueOnce(options('l1'))
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
    request.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    expect(startAuthentication).not.toHaveBeenCalled()
  })

  it('ends the offer quietly when the browser refuses it or the user backs out of the pick', async () => {
    request.mockResolvedValueOnce(options('l1'))
    startAuthentication.mockRejectedValueOnce(notAllowed())

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).resolves.toBeNull()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(loginOptionsCalls()).toBe(1)
  })

  it('reports a failure after the pick, as the button would', async () => {
    request.mockResolvedValueOnce(options('l1')).mockRejectedValueOnce(new ApiError(401, 'invalid_credential', 'not registered'))
    startAuthentication.mockResolvedValue(picked)

    await expect(signInWithPasskeyFromAutofill(new AbortController().signal)).rejects.toSatisfy(
      error => error instanceof ApiError && error.code === 'invalid_credential',
    )
  })
})
