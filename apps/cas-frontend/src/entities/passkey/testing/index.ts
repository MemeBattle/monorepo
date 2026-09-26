import { ceremonyMock, domainMock } from '#shared/testing/domainMock'
import type { Passkey } from '../index'
import { aPasskey } from './builders'
import { registrationOptions } from '#shared/testing/webauthn'

export { aPasskey } from './builders'

const commonErrors = { unauthenticated: 401, database_unavailable: 503, database_busy: 503, cross_site_request: 403, internal_error: 500 } as const
const renameErrors = { ...commonErrors, invalid_passkey_name: 400, passkey_not_found: 404 } as const
const deleteErrors = { ...commonErrors, passkey_not_found: 404, last_passkey: 409 } as const
export const mockListPasskeys = domainMock<Record<string, never>, Passkey[], Passkey[], keyof typeof commonErrors>(
  'GET',
  '/api/passkeys',
  (passkeys = [aPasskey()]) => passkeys,
  commonErrors,
  passkeys => ({ passkeys }),
)
export const mockRenamePasskey = domainMock<{ id: string; name: string }, Partial<Passkey>, Passkey, keyof typeof renameErrors>(
  'PATCH',
  '/api/passkeys/:id',
  aPasskey,
  renameErrors,
)
export const mockDeletePasskey = domainMock<{ id: string }, void, void, keyof typeof deleteErrors>(
  'DELETE',
  '/api/passkeys/:id',
  () => undefined,
  deleteErrors,
)
const registrationErrors = {
  ...commonErrors,
  registration_not_found: 404,
  registration_expired: 404,
  registration_verification_failed: 400,
  discoverable_credential_required: 400,
  credential_already_registered: 409,
} as const
export const mockAddPasskey = ceremonyMock<Record<string, never>, Partial<Passkey>, Passkey, keyof typeof registrationErrors>(
  '/api/passkeys/register-options',
  '/api/passkeys/verify-registration',
  registrationOptions,
  'registrationId',
  aPasskey,
  registrationErrors,
  ['unauthenticated', 'database_unavailable', 'database_busy', 'cross_site_request', 'internal_error'],
  201,
)
