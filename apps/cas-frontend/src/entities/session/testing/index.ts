import { domainMock, failureResponse, isFailure, successResponse } from '#shared/testing/domainMock'
import type { Answer, Failure, Resolver } from '#shared/testing/domainMock'
import { mockRequest } from '#shared/testing/mockRequest'
import type { Spy } from '#shared/testing/runtime'
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
type RegistrationError = keyof typeof registrationErrors
const registrationFailure = (failure: Failure<RegistrationError>) =>
  failureResponse('error' in failure && failure.error === 'registration_expired' ? { error: 'registration_not_found' } : failure, registrationErrors)

const respondRegisterWithPasskey = (resolver: Resolver<{ displayName: string }, Registered, RegistrationError>) => {
  let sequence = 0
  const registrations = new Map<string, Answer<Registered, RegistrationError>>()
  const spy = mockRequest('POST', '/api/webauthn/register-options').respond(async args => {
    const answer = await resolver(args as { displayName: string })
    if (
      isFailure<RegistrationError>(answer) &&
      ('networkError' in answer || answer.error === 'invalid_display_name' || answer.error in commonErrors)
    ) {
      return registrationFailure(answer)
    }
    const registrationId = `ceremony-${++sequence}`
    registrations.set(registrationId, answer)
    return successResponse(registrationOptions(registrationId))
  }) as Spy<{ displayName: string }>
  mockRequest('POST', '/api/webauthn/verify-registration').respond(args => {
    const registrationId = String(args.registrationId)
    const answer = registrations.get(registrationId)
    if (!answer) {
      throw new Error(`Verification does not match an issued ceremony: ${registrationId}`)
    }
    registrations.delete(registrationId)
    return isFailure<RegistrationError>(answer) ? registrationFailure(answer) : successResponse(answer)
  })
  return spy
}

export const mockRegisterWithPasskey = Object.assign((input?: Partial<Registered>) => respondRegisterWithPasskey(() => aRegistration(input)), {
  respond: respondRegisterWithPasskey,
  error: (code: RegistrationError) => respondRegisterWithPasskey(() => ({ error: code })),
  networkError: () => respondRegisterWithPasskey(() => ({ networkError: true })),
})

const loginErrors = { ...commonErrors, invalid_credential: 401, login_not_found: 404 } as const
type LoginError = keyof typeof loginErrors
const respondSignInWithPasskey = (resolver: Resolver<Record<string, never>, SignedIn, LoginError>) => {
  let sequence = 0
  const logins = new Map<string, Answer<SignedIn, LoginError>>()
  const spy = mockRequest('POST', '/api/webauthn/login-options').respond(async args => {
    const answer = await resolver(args as Record<string, never>)
    if (isFailure<LoginError>(answer) && ('networkError' in answer || answer.error in commonErrors)) {
      return failureResponse(answer, loginErrors)
    }
    const loginId = `ceremony-${++sequence}`
    logins.set(loginId, answer)
    return successResponse(loginOptions(loginId))
  }) as Spy<Record<string, never>>
  mockRequest('POST', '/api/webauthn/verify-login').respond(args => {
    const loginId = String(args.loginId)
    const answer = logins.get(loginId)
    if (!answer) {
      throw new Error(`Verification does not match an issued ceremony: ${loginId}`)
    }
    logins.delete(loginId)
    return isFailure<LoginError>(answer) ? failureResponse(answer, loginErrors) : successResponse(answer)
  })
  return spy
}

export const mockSignInWithPasskey = Object.assign((input?: Partial<SignedIn>) => respondSignInWithPasskey(() => aRegistration(input)), {
  respond: respondSignInWithPasskey,
  error: (code: LoginError) => respondSignInWithPasskey(() => ({ error: code })),
  networkError: () => respondSignInWithPasskey(() => ({ networkError: true })),
})
