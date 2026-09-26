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
