import { DiscoveryError, InvalidTokenError } from '@memebattle/ligretto-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSocketMockImpl } from '../../../test/utils'
import { CAS_AUDIENCE, CAS_ISSUER } from '../../config'
import { authMiddleware } from '../authMiddleware'

const verifyAccessToken = vi.hoisted(() => vi.fn())

// Only the verifier is stubbed: `InvalidTokenError` stays the package's own, so a refusal here has the real shape.
vi.mock('@memebattle/ligretto-auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@memebattle/ligretto-auth')>()),
  verifyAccessToken,
}))

const claimsOf = (sub: string) => ({
  sub,
  client_id: 'ligretto',
  scope: 'openid profile',
  amr: ['webauthn'],
  account_type: 'full' as const,
  iss: CAS_ISSUER,
  aud: CAS_AUDIENCE,
  exp: 1_000,
  iat: 0,
  jti: 'token-id',
})

describe('authMiddleware', () => {
  beforeEach(() => {
    verifyAccessToken.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('accepts a verified access token and takes the user id from `sub`', async () => {
    verifyAccessToken.mockResolvedValue(claimsOf('5f1e3e5c-0b2a-4d8e-9c3f-6a1b2c3d4e5f'))
    const socket = createSocketMockImpl({ data: {}, handshake: { auth: { token: 'access-token' } } })
    const next = vi.fn()

    await authMiddleware(socket, next)

    expect(verifyAccessToken).toHaveBeenCalledWith('access-token', { issuer: CAS_ISSUER, audience: 'ligretto' })
    expect(next).toHaveBeenCalledWith()
    expect(socket.data.userId).toBe('5f1e3e5c-0b2a-4d8e-9c3f-6a1b2c3d4e5f')
  })

  // The refusals differ only in the code they carry: the message is the same opaque one, so each case asserts its code.
  it('refuses an ID token under the `wrong_typ` code', async () => {
    verifyAccessToken.mockRejectedValue(new InvalidTokenError('wrong_typ', 'An access token says `typ: at+jwt`; this one says "JWT".'))
    const socket = createSocketMockImpl({ data: {}, handshake: { auth: { token: 'id-token' } } })
    const next = vi.fn()

    await authMiddleware(socket, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized', data: { code: 'wrong_typ' } }))
    expect(socket.data.userId).toBeUndefined()
  })

  it('refuses a token minted for another audience under the `wrong_audience` code', async () => {
    verifyAccessToken.mockRejectedValue(new InvalidTokenError('wrong_audience', 'The token was minted for another audience.'))
    const socket = createSocketMockImpl({ data: {}, handshake: { auth: { token: 'other-audience-token' } } })
    const next = vi.fn()

    await authMiddleware(socket, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized', data: { code: 'wrong_audience' } }))
    expect(socket.data.userId).toBeUndefined()
  })

  // Unreadable CAS metadata is not a judgement on the token: the client is told to retry, not to sign in again.
  it('refuses the handshake under the discovery code when CAS metadata cannot be read', async () => {
    verifyAccessToken.mockRejectedValue(new DiscoveryError('discovery_unavailable', 'The discovery document could not be fetched.'))
    const socket = createSocketMockImpl({ data: {}, handshake: { auth: { token: 'access-token' } } })
    const next = vi.fn()

    await authMiddleware(socket, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized', data: { code: 'discovery_unavailable' } }))
    expect(socket.data.userId).toBeUndefined()
  })

  it('refuses a handshake carrying no token without asking CAS anything', async () => {
    const socket = createSocketMockImpl({ data: {}, handshake: { auth: {} } })
    const next = vi.fn()

    await authMiddleware(socket, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(verifyAccessToken).not.toHaveBeenCalled()
    expect(socket.data.userId).toBeUndefined()
  })
})
