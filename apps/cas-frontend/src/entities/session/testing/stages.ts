// Private wire-stage helpers for this entity's ceremony specs only. Never re-export from index.ts.
import { domainMock } from '#shared/testing/domainMock'
import { aRegistration } from './builders'
import { loginOptions } from '#shared/testing/webauthn'
import type { SignedIn } from '../index'

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
