import { ceremonyMock, domainMock } from '#shared/testing/domainMock'
import type { Me, Registered, SignedIn } from '../index'
import { aMe, aRegistration } from './builders'
import { loginOptions, registrationOptions } from '#shared/testing/webauthn'

export { aMe, aRegistration } from './builders'

const commonErrors = { database_unavailable: 503, database_busy: 503, cross_site_request: 403, internal_error: 500 } as const
const sessionErrors = { ...commonErrors, unauthenticated: 401 } as const
export const mockGetMe = domainMock<Record<string, never>, Partial<Me>, Me, keyof typeof sessionErrors>('GET', '/api/me', aMe, sessionErrors)
export const mockLogout = domainMock<Record<string, never>, void, void, keyof typeof sessionErrors>(
  'POST',
  '/api/logout',
  () => undefined,
  sessionErrors,
)
const emailErrors = { ...sessionErrors, invalid_email: 400, account_not_found: 404 } as const
export const mockUpdateEmail = domainMock<{ email: string | null }, void, void, keyof typeof emailErrors>(
  'PATCH',
  '/api/me',
  () => undefined,
  emailErrors,
)
const registrationErrors = {
  ...commonErrors,
  invalid_display_name: 400,
  registration_not_found: 404,
  registration_expired: 404,
  registration_verification_failed: 400,
  discoverable_credential_required: 400,
  credential_already_registered: 409,
} as const
export const mockRegisterWithPasskey = ceremonyMock<{ displayName: string }, Partial<Registered>, Registered, keyof typeof registrationErrors>(
  '/api/webauthn/register-options',
  '/api/webauthn/verify-registration',
  registrationOptions,
  'registrationId',
  aRegistration,
  registrationErrors,
  ['invalid_display_name', 'database_unavailable', 'database_busy', 'cross_site_request', 'internal_error'],
)
const loginErrors = { ...commonErrors, invalid_credential: 401, login_not_found: 404 } as const
export const mockSignInWithPasskey = ceremonyMock<Record<string, never>, Partial<SignedIn>, SignedIn, keyof typeof loginErrors>(
  '/api/webauthn/login-options',
  '/api/webauthn/verify-login',
  loginOptions,
  'loginId',
  aRegistration,
  loginErrors,
  ['database_unavailable', 'database_busy', 'cross_site_request', 'internal_error'],
)
