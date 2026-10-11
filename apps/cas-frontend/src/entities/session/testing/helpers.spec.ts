import { ok } from '#shared/api/client'
import { expect, it, vi } from 'vitest'
import { getMe, logout, updateEmail, registerWithPasskey, signInWithPasskey } from '../index'
import { aMe, mockGetMe, mockLogout, mockUpdateEmail, mockRegisterWithPasskey, mockSignInWithPasskey } from './index'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }))

it('builds fresh complete accounts and preserves explicit null', async () => {
  expect(aMe()).not.toBe(aMe())
  mockGetMe({ email: null })
  await expect(getMe()).resolves.toEqual(ok(aMe({ email: null })))
  mockGetMe({ email: 'ada@mems.fun' })
  await expect(getMe()).resolves.toEqual(ok(aMe({ email: 'ada@mems.fun' })))
})

it('records email and logout through bodyless responses', async () => {
  const email = mockUpdateEmail()
  const logoutCall = mockLogout()
  await expect(updateEmail(null)).resolves.toEqual(ok(undefined))
  await logout()
  expect(email).toHaveBeenCalledExactlyOnceWith({ email: null })
  expect(logoutCall).toHaveBeenCalledExactlyOnceWith({})
})

it('maps documented errors and supports per-request deferred answers', async () => {
  mockUpdateEmail.error('invalid_email')
  await expect(updateEmail('invalid')).resolves.toMatchObject({ ok: false, error: { status: 400, code: 'invalid_email' } })
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  const save = mockUpdateEmail.respond(() => promise)
  const pending = updateEmail('ada@mems.fun')
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
  resolve()
  await expect(pending).resolves.toEqual(ok(undefined))
})

it('runs composite ceremonies and records only domain input', async () => {
  vi.mocked(startRegistration).mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startRegistration>>)
  vi.mocked(startAuthentication).mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startAuthentication>>)
  const register = mockRegisterWithPasskey({ accountId: 'ada' })
  await expect(registerWithPasskey('Ada')).resolves.toEqual(ok({ accountId: 'ada', credentialId: 'cred' }))
  expect(register).toHaveBeenCalledExactlyOnceWith({ displayName: 'Ada' })
  const login = mockSignInWithPasskey()
  await expect(signInWithPasskey()).resolves.toEqual(ok({ accountId: 'acc', credentialId: 'cred' }))
  expect(login).toHaveBeenCalledExactlyOnceWith({})
})

it('selects registration error stage from the code', async () => {
  vi.mocked(startRegistration).mockClear()
  mockRegisterWithPasskey.error('invalid_display_name')
  await expect(registerWithPasskey('')).resolves.toMatchObject({ ok: false, error: { status: 400, code: 'invalid_display_name' } })
  expect(startRegistration).not.toHaveBeenCalled()
  mockRegisterWithPasskey.error('registration_expired')
  await expect(registerWithPasskey('Ada')).resolves.toMatchObject({ ok: false, error: { status: 404, code: 'registration_not_found' } })
  expect(startRegistration).toHaveBeenCalledOnce()
})

it.each([
  ['internal_error', 500],
  ['database_busy', 503],
] as const)('uses the CAS infrastructure error %s', async (code, status) => {
  mockGetMe.error(code)
  await expect(getMe()).rejects.toMatchObject({ code, status })
})

it.each([
  ['database_unavailable', 503, false],
  ['invalid_credential', 401, true],
  ['login_not_found', 404, true],
] as const)('fails sign-in at the expected stage for %s', async (code, status, verifies) => {
  vi.mocked(startAuthentication).mockClear()
  mockSignInWithPasskey.error(code)
  if (status >= 500) {
    await expect(signInWithPasskey()).rejects.toMatchObject({ code, status })
  } else {
    await expect(signInWithPasskey()).resolves.toMatchObject({ ok: false, error: { code, status } })
  }
  expect(startAuthentication).toHaveBeenCalledTimes(verifies ? 1 : 0)
})

it('correlates deferred registration answers when authenticators finish out of order', async () => {
  let finishFirst!: (value: Awaited<ReturnType<typeof startRegistration>>) => void
  vi.mocked(startRegistration)
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishFirst = resolve
        }),
    )
    .mockResolvedValueOnce({ id: 'second' } as Awaited<ReturnType<typeof startRegistration>>)
  const register = mockRegisterWithPasskey.respond(async ({ displayName }) => ({ accountId: displayName, credentialId: displayName }))
  const first = registerWithPasskey('First')
  await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'))
  await expect(registerWithPasskey('Second')).resolves.toEqual(ok({ accountId: 'Second', credentialId: 'Second' }))
  finishFirst({ id: 'first' } as Awaited<ReturnType<typeof startRegistration>>)
  await expect(first).resolves.toEqual(ok({ accountId: 'First', credentialId: 'First' }))
  expect(register.mock.calls).toEqual([[{ displayName: 'First' }], [{ displayName: 'Second' }]])
})

it('rejects composite network failures before invoking authenticators', async () => {
  vi.mocked(startRegistration).mockClear()
  vi.mocked(startAuthentication).mockClear()
  mockRegisterWithPasskey.networkError()
  mockSignInWithPasskey.networkError()
  await expect(registerWithPasskey('Ada')).rejects.toThrow()
  await expect(signInWithPasskey()).rejects.toThrow()
  expect(startRegistration).not.toHaveBeenCalled()
  expect(startAuthentication).not.toHaveBeenCalled()
})

it('supports a guest upgrade and a session lost during verification through the composite API', async () => {
  const guest = { accountId: '0191e2a4-5b6c-7d8e-9fa0-b1c2d3e4f506' }
  vi.mocked(startRegistration)
    .mockClear()
    .mockResolvedValue({ id: 'credential' } as Awaited<ReturnType<typeof startRegistration>>)
  const register = mockRegisterWithPasskey(guest)
  await expect(registerWithPasskey('Ada', guest)).resolves.toEqual(ok({ ...guest, credentialId: 'cred' }))
  expect(register).toHaveBeenCalledExactlyOnceWith({ displayName: 'Ada' })
  mockRegisterWithPasskey.error('unauthenticated')
  await expect(registerWithPasskey('Ada', guest)).resolves.toMatchObject({ ok: false, error: { status: 401, code: 'unauthenticated' } })
  expect(startRegistration).toHaveBeenCalledTimes(2)
})
