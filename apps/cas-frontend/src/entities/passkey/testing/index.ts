import { domainMock, failureResponse, isFailure, successResponse } from '#shared/testing/domainMock'
import type { Answer, Failure, Resolver } from '#shared/testing/domainMock'
import { mockRequest } from '#shared/testing/mockRequest'
import type { Spy } from '#shared/testing/runtime'
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
type RegistrationError = keyof typeof registrationErrors
const registrationFailure = (failure: Failure<RegistrationError>) =>
  failureResponse('error' in failure && failure.error === 'registration_expired' ? { error: 'registration_not_found' } : failure, registrationErrors)

const respondAddPasskey = (resolver: Resolver<Record<string, never>, Passkey, RegistrationError>) => {
  let sequence = 0
  const registrations = new Map<string, Answer<Passkey, RegistrationError>>()
  const spy = mockRequest('POST', '/api/passkeys/register-options').respond(async args => {
    const answer = await resolver(args as Record<string, never>)
    if (isFailure<RegistrationError>(answer) && ('networkError' in answer || answer.error in commonErrors)) {
      return registrationFailure(answer)
    }
    const registrationId = `ceremony-${++sequence}`
    registrations.set(registrationId, answer)
    return successResponse(registrationOptions(registrationId))
  }) as Spy<Record<string, never>>
  mockRequest('POST', '/api/passkeys/verify-registration').respond(args => {
    const registrationId = String(args.registrationId)
    const answer = registrations.get(registrationId)
    if (!answer) {
      throw new Error(`Verification does not match an issued ceremony: ${registrationId}`)
    }
    registrations.delete(registrationId)
    return isFailure<RegistrationError>(answer) ? registrationFailure(answer) : successResponse(answer, 201)
  })
  return spy
}

export const mockAddPasskey = Object.assign((input?: Partial<Passkey>) => respondAddPasskey(() => aPasskey(input)), {
  respond: respondAddPasskey,
  error: (code: RegistrationError) => respondAddPasskey(() => ({ error: code })),
  networkError: () => respondAddPasskey(() => ({ networkError: true })),
})
