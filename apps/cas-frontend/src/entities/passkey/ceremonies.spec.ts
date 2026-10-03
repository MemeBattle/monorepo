import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockAddOptions, mockAddVerification } from './testing/stages'
import { addPasskey } from './ceremonies'

const { startRegistration } = vi.hoisted(() => ({
  startRegistration: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration,
}))

describe('addPasskey', () => {
  const options = { registrationId: 'r1', ccr: { publicKey: { challenge: 'c', excludeCredentials: [{ id: 'cred', type: 'public-key' }] } } }
  const made = { id: 'new', rawId: 'new', response: {}, type: 'public-key', clientExtensionResults: {} }
  const passkey = { id: 'p2', name: 'Пасскей', createdAt: '2026-09-19T10:00:00Z', lastUsedAt: null }

  afterEach(() => {
    startRegistration.mockReset()
  })

  it('asks for a challenge without a body, hands it to the authenticator and finishes with the answer', async () => {
    const requested = mockAddOptions(options)
    const verified = mockAddVerification(passkey)
    startRegistration.mockResolvedValue(made)

    await expect(addPasskey()).resolves.toEqual(passkey)

    expect(requested).toHaveBeenCalledExactlyOnceWith({})
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options.ccr.publicKey })
    expect(verified).toHaveBeenCalledExactlyOnceWith({ registrationId: 'r1', response: made })
  })

  it('returns 201 with the created passkey from private verification, keeping options at 200', async () => {
    mockAddOptions(options)
    mockAddVerification(passkey)
    const challenge = await fetch('/api/passkeys/register-options', { method: 'POST' })
    expect(challenge.status).toBe(200)
    const { registrationId } = await challenge.json()
    const response = await fetch('/api/passkeys/verify-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, response: made }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(passkey)
  })

  it('lets the authenticator’s verdict through as it is and finishes nothing', async () => {
    const requested = mockAddOptions(options)
    const verified = mockAddVerification()
    const cause = new DOMException('already registered', 'InvalidStateError')
    startRegistration.mockRejectedValue(new WebAuthnError({ message: cause.message, code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', cause }))

    await expect(addPasskey()).rejects.toSatisfy(error => error instanceof WebAuthnError && error.name === 'InvalidStateError')

    expect(requested).toHaveBeenCalledOnce()
    expect(verified).not.toHaveBeenCalled()
  })

  it('asks the authenticator for nothing without a session', async () => {
    mockAddOptions.error('unauthenticated')

    await expect(addPasskey()).rejects.toSatisfy(error => error.code === 'unauthenticated')

    expect(startRegistration).not.toHaveBeenCalled()
  })
})
