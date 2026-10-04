import { WebAuthnError } from '@simplewebauthn/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/client'
import { addPasskey } from './ceremonies'

const { client, startRegistration } = vi.hoisted(() => ({
  client: vi.fn(),
  startRegistration: vi.fn(),
}))
vi.mock('#shared/api/client', async importOriginal => ({ ...(await importOriginal<typeof import('#shared/api/client')>()), client }))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration,
}))

describe('addPasskey', () => {
  const options = { registrationId: 'r1', ccr: { publicKey: { challenge: 'c', excludeCredentials: [{ id: 'cred', type: 'public-key' }] } } }
  const made = { id: 'new', rawId: 'new', response: {}, type: 'public-key', clientExtensionResults: {} }
  const passkey = { id: 'p2', name: 'Пасскей', createdAt: '2026-09-19T10:00:00Z', lastUsedAt: null }

  afterEach(() => {
    client.mockReset()
    startRegistration.mockReset()
  })

  it('asks for a challenge without a body, hands it to the authenticator and finishes with the answer', async () => {
    client.mockResolvedValueOnce(options).mockResolvedValueOnce(passkey)
    startRegistration.mockResolvedValue(made)

    await expect(addPasskey()).resolves.toEqual(passkey)

    expect(client).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: 'POST', url: '/api/passkeys/register-options' }))
    expect(client.mock.calls[0]?.[0]).not.toHaveProperty('body')
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options.ccr.publicKey })
    expect(client).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'POST', url: '/api/passkeys/verify-registration', body: { registrationId: 'r1', response: made } }),
    )
  })

  it('lets the authenticator’s verdict through as it is and finishes nothing', async () => {
    client.mockResolvedValueOnce(options)
    const cause = new DOMException('already registered', 'InvalidStateError')
    startRegistration.mockRejectedValue(new WebAuthnError({ message: cause.message, code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', cause }))

    await expect(addPasskey()).rejects.toSatisfy(error => error instanceof WebAuthnError && error.name === 'InvalidStateError')

    expect(client).toHaveBeenCalledOnce()
  })

  it('asks the authenticator for nothing without a session', async () => {
    client.mockRejectedValueOnce(new ApiError(401, 'unauthenticated', 'No live session'))

    await expect(addPasskey()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'unauthenticated')

    expect(startRegistration).not.toHaveBeenCalled()
  })
})
