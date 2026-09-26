// Private wire-stage helpers for this entity's ceremony specs only. Never re-export from index.ts.
import { domainMock } from '#shared/testing/domainMock'
import { aPasskey } from './builders'
import { registrationOptions } from '#shared/testing/webauthn'
import type { Passkey } from '../index'

const optionsErrors = { unauthenticated: 401 } as const
const verifyErrors = { registration_not_found: 404 } as const
export const mockAddOptions = domainMock<Record<string, never>, Record<string, unknown>, Record<string, unknown>, keyof typeof optionsErrors>(
  'POST',
  '/api/passkeys/register-options',
  (value = registrationOptions('r1')) => value,
  optionsErrors,
)
export const mockAddVerification = domainMock<{ registrationId: string; response: unknown }, Partial<Passkey>, Passkey, keyof typeof verifyErrors>(
  'POST',
  '/api/passkeys/verify-registration',
  aPasskey,
  verifyErrors,
  undefined,
  201,
)
