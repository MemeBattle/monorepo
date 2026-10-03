import { expect, it, vi } from 'vitest'
import { listPasskeys, renamePasskey, deletePasskey, addPasskey } from '../index'
import { aPasskey, mockListPasskeys, mockRenamePasskey, mockDeletePasskey, mockAddPasskey } from './index'
import { startRegistration } from '@simplewebauthn/browser'

vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn() }))

it('unwraps passkeys, merges defaults and flattens parsed arguments', async () => {
  const phone = aPasskey({ id: 'pk_2', name: 'iPhone' })
  expect(aPasskey()).not.toBe(aPasskey())
  mockListPasskeys([phone])
  await expect(listPasskeys()).resolves.toEqual([phone])
  const rename = mockRenamePasskey(phone)
  await expect(renamePasskey('pk_2', 'iPhone')).resolves.toEqual(phone)
  expect(rename).toHaveBeenCalledExactlyOnceWith({ id: 'pk_2', name: 'iPhone' })
  const remove = mockDeletePasskey()
  await expect(deletePasskey('pk_2')).resolves.toBeUndefined()
  expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 'pk_2' })
})

it.each([
  ['last_passkey', 409],
  ['passkey_not_found', 404],
  ['unauthenticated', 401],
] as const)('maps %s to %s', async (code, status) => {
  mockDeletePasskey.error(code)
  await expect(deletePasskey('pk_2')).rejects.toMatchObject({ code, status })
})

it('returns 201 with the created passkey from composite verification, keeping options at 200', async () => {
  const passkey = aPasskey({ id: 'pk_new', name: 'Phone' })
  mockAddPasskey(passkey)
  const options = await fetch('/api/passkeys/register-options', { method: 'POST' })
  expect(options.status).toBe(200)
  const { registrationId } = await options.json()
  const response = await fetch('/api/passkeys/verify-registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId, response: { id: 'credential' } }),
  })
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual(passkey)
})

it('fails add options without invoking the authenticator for an expired session', async () => {
  mockAddPasskey.error('unauthenticated')
  await expect(addPasskey()).rejects.toMatchObject({ code: 'unauthenticated', status: 401 })
  expect(startRegistration).not.toHaveBeenCalled()
})

it.each([
  ['registration_expired', 'registration_not_found', 404],
  ['credential_already_registered', 'credential_already_registered', 409],
] as const)('fails add verification for %s', async (error, code, status) => {
  vi.mocked(startRegistration)
    .mockReset()
    .mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startRegistration>>)
  const add = mockAddPasskey.error(error)
  await expect(addPasskey()).rejects.toMatchObject({ code, status })
  expect(startRegistration).toHaveBeenCalledOnce()
  expect(add).toHaveBeenCalledExactlyOnceWith({})
})

it('supports deferred add answers and records one domain call', async () => {
  vi.mocked(startRegistration).mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startRegistration>>)
  const passkey = aPasskey({ name: 'Phone' })
  let finish!: (value: typeof passkey) => void
  const add = mockAddPasskey.respond(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  const pending = addPasskey()
  await vi.waitFor(() => expect(add).toHaveBeenCalledExactlyOnceWith({}))
  finish(passkey)
  await expect(pending).resolves.toEqual(passkey)
})

it('rejects add network failures before invoking the authenticator', async () => {
  vi.mocked(startRegistration).mockClear()
  mockAddPasskey.networkError()
  await expect(addPasskey()).rejects.toThrow()
  expect(startRegistration).not.toHaveBeenCalled()
})
