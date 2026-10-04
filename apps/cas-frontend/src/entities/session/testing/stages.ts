// Private wire-stage helpers for this entity's ceremony specs only. Never re-export from index.ts.
import { domainMock } from '#shared/testing/domainMock'
import { aRegistration } from './builders'
import { loginOptions, registrationOptions } from '#shared/testing/webauthn'
import type { Registered, SignedIn } from '../index'

const optionsErrors = { database_unavailable: 503 } as const
const verifyErrors = { invalid_credential: 401, login_not_found: 404 } as const
export const mockLoginOptions = domainMock<Record<string, never>, Record<string, unknown>, Record<string, unknown>, keyof typeof optionsErrors>(
  'POST',
  '/api/webauthn/login-options',
  (value = loginOptions('l1')) => value,
  optionsErrors,
)
export const mockLoginVerification = domainMock<{ loginId: string; response: unknown }, Partial<SignedIn>, SignedIn, keyof typeof verifyErrors>(
  'POST',
  '/api/webauthn/verify-login',
  aRegistration,
  verifyErrors,
)

export const mockRegistrationOptions = domainMock<
  { displayName: string },
  Record<string, unknown>,
  Record<string, unknown>,
  keyof typeof optionsErrors
>('POST', '/api/webauthn/register-options', (value = registrationOptions('r1')) => value, optionsErrors)
export const mockRegistrationVerification = domainMock<
  { registrationId: string; response: unknown },
  Partial<Registered>,
  Registered,
  'unauthenticated'
>('POST', '/api/webauthn/verify-registration', aRegistration, { unauthenticated: 401 })
