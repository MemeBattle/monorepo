import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { addPasskey } from './ceremonies'

const { request, startRegistration } = vi.hoisted(() => ({
  request: vi.fn(),
  startRegistration: vi.fn(),
}))
vi.mock('#shared/api/request', async importOriginal => ({ ...(await importOriginal<typeof import('#shared/api/request')>()), request }))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration,
}))

describe('addPasskey', () => {
  const options = { registrationId: 'r1', ccr: { publicKey: { challenge: 'c', excludeCredentials: [{ id: 'cred', type: 'public-key' }] } } }
  const made = { id: 'new', rawId: 'new', response: {}, type: 'public-key', clientExtensionResults: {} }
  const passkey = { id: 'p2', name: 'Пасскей', createdAt: '2026-09-19T10:00:00Z', lastUsedAt: null }

  afterEach(() => {
    request.mockReset()
    startRegistration.mockReset()
  })

  it('asks for a challenge without a body, hands it to the authenticator and finishes with the answer', async () => {
    request.mockResolvedValueOnce(options).mockResolvedValueOnce(passkey)
    startRegistration.mockResolvedValue(made)

    await expect(addPasskey()).resolves.toEqual(passkey)

    expect(request).toHaveBeenNthCalledWith(1, '/api/passkeys/register-options', { method: 'POST' })
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options.ccr.publicKey })
    expect(request).toHaveBeenNthCalledWith(2, '/api/passkeys/verify-registration', {
      method: 'POST',
      body: { registrationId: 'r1', response: made },
    })
  })

  it('lets the authenticator’s verdict through as it is and finishes nothing', async () => {
    request.mockResolvedValueOnce(options)
    const cause = new DOMException('already registered', 'InvalidStateError')
    startRegistration.mockRejectedValue(new WebAuthnError({ message: cause.message, code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', cause }))

    await expect(addPasskey()).rejects.toSatisfy(error => error instanceof WebAuthnError && error.name === 'InvalidStateError')

    expect(request).toHaveBeenCalledOnce()
  })

  it('asks the authenticator for nothing without a session', async () => {
    request.mockRejectedValueOnce(new ApiError(401, 'unauthenticated', 'No live session'))

    await expect(addPasskey()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'unauthenticated')

    expect(startRegistration).not.toHaveBeenCalled()
  })
})
