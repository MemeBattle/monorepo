import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import type { AuthRouteFragment } from './schema'
import {
  AccountTypeSchema,
  AUTH_ERROR_CODES,
  AuthErrorCodeSchema,
  AuthErrorResponseSchema,
  authRouteFragments,
  CallbackQuerySchema,
  MeResponseSchema,
  NavigationResponseSchema,
} from './schema'
import type { SessionTransportKind } from './transport'

const TRANSPORTS: SessionTransportKind[] = ['cookie', 'bearer']

const guestAnswer = {
  user: { sub: 'a0a0a0a0-0000-4000-8000-00000000000a', accountType: 'guest', name: null, avatarUrl: null },
  accessToken: 'access-1',
  expiresAt: 1_793_000_600_000,
  signedOut: false,
}

/** The JSON schema a fragment declares for a status, or `undefined` when the status has no body or is not declared. */
const schemaOf = (fragment: AuthRouteFragment, status: string): z.ZodType | undefined =>
  fragment.responses[status]?.content?.['application/json'].schema

/** The codes of the contract a status's refusal accepts. */
const acceptedCodes = (fragment: AuthRouteFragment, status: string): string[] =>
  AUTH_ERROR_CODES.filter(error => schemaOf(fragment, status)?.safeParse({ error }).success === true)

describe('the enums', () => {
  it('lists the account types and the error codes in the order the contract documents them', () => {
    expect(AccountTypeSchema.options).toEqual(['guest', 'full'])
    expect(AuthErrorCodeSchema.options).toEqual(['unknown_state', 'sign_in_failed', 'rate_limit_exceeded', 'cas_unavailable', 'cas_rejected'])
  })
})

describe('CallbackQuerySchema', () => {
  it('takes a code, or the error CAS refused the request with, with or without a description', () => {
    expect(CallbackQuerySchema.parse({ state: 's', code: 'c' })).toEqual({ state: 's', code: 'c' })
    expect(CallbackQuerySchema.parse({ state: 's', error: 'access_denied', error_description: 'no' })).toEqual({
      state: 's',
      error: 'access_denied',
      error_description: 'no',
    })
    expect(CallbackQuerySchema.parse({ state: 's', error: 'access_denied' })).toEqual({ state: 's', error: 'access_denied' })
  })

  it('strips a parameter it does not read instead of refusing it', () => {
    // RFC 9207's `iss`, or anything a proxy appends: refusing it would turn a working sign-in into a failed one.
    expect(CallbackQuerySchema.parse({ state: 's', code: 'c', iss: 'https://cas.example' })).toEqual({ state: 's', code: 'c' })
  })

  it('refuses a query without a state, and a value that is not a string', () => {
    expect(CallbackQuerySchema.safeParse({ code: 'c' }).success).toBe(false)
    expect(CallbackQuerySchema.safeParse({ state: 's', code: 1 }).success).toBe(false)
  })
})

describe('MeResponseSchema', () => {
  it('takes a guest answer without a session id, and a bearer handover with one', () => {
    expect(MeResponseSchema.safeParse(guestAnswer).success).toBe(true)
    expect(MeResponseSchema.safeParse({ ...guestAnswer, sessionId: 'session-1' }).success).toBe(true)
  })

  it('refuses an expiry that is not an integer, and a missing name, which is `null` when there is none', () => {
    expect(MeResponseSchema.safeParse({ ...guestAnswer, expiresAt: 1.5 }).success).toBe(false)
    expect(MeResponseSchema.safeParse({ ...guestAnswer, user: { ...guestAnswer.user, name: undefined } }).success).toBe(false)
  })
})

describe('AuthErrorResponseSchema', () => {
  it('takes a refusal with the code CAS named, and no code outside the contract', () => {
    expect(AuthErrorResponseSchema.safeParse({ error: 'cas_rejected', casError: 'invalid_client', description: 'no' }).success).toBe(true)
    // 500 is the unhandled, never a code of the contract.
    expect(AuthErrorResponseSchema.safeParse({ error: 'internal_error' }).success).toBe(false)
  })
})

describe('authRouteFragments', () => {
  it('redirects sign-in and logout in the cookie transport', () => {
    const { signIn, logout } = authRouteFragments('cookie')

    for (const fragment of [signIn, logout]) {
      expect(fragment.responses).toHaveProperty('302')
      expect(fragment.responses).not.toHaveProperty('200')
      expect(fragment.responses['302']?.content).toBeUndefined()
    }
  })

  it('answers sign-in and logout with the URL to navigate to in the bearer transport', () => {
    const { signIn, logout } = authRouteFragments('bearer')

    for (const fragment of [signIn, logout]) {
      expect(fragment.responses).not.toHaveProperty('302')
      expect(schemaOf(fragment, '200')).toBe(NavigationResponseSchema)
    }
  })

  it.each(TRANSPORTS)('redirects the callback and answers me with its body in the %s transport', kind => {
    const { me, callback } = authRouteFragments(kind)

    expect(callback.responses).toHaveProperty('302')
    expect(callback.responses).not.toHaveProperty('200')
    expect(callback.request?.query).toBe(CallbackQuerySchema)
    expect(schemaOf(me, '200')).toBe(MeResponseSchema)
  })

  it.each(TRANSPORTS)('declares on each error status exactly the codes the route answers with it in the %s transport', kind => {
    const { me, signIn, callback, logout } = authRouteFragments(kind)

    expect(acceptedCodes(me, '429')).toEqual(['rate_limit_exceeded'])
    expect(acceptedCodes(me, '503')).toEqual(['cas_unavailable', 'cas_rejected'])
    expect(acceptedCodes(signIn, '429')).toEqual(['rate_limit_exceeded'])
    expect(acceptedCodes(signIn, '503')).toEqual(['cas_unavailable', 'cas_rejected'])
    expect(acceptedCodes(callback, '400')).toEqual(['unknown_state', 'sign_in_failed'])
    expect(acceptedCodes(callback, '429')).toEqual(['rate_limit_exceeded'])
    expect(acceptedCodes(callback, '503')).toEqual(['cas_unavailable', 'cas_rejected'])
    // The logout reads metadata and calls no token endpoint: nothing can refuse this client there.
    expect(acceptedCodes(logout, '503')).toEqual(['cas_unavailable'])
    expect(logout.responses).not.toHaveProperty('429')
    // A narrowed refusal still carries the rest of the body.
    expect(schemaOf(me, '503')?.safeParse({ error: 'cas_unavailable', description: 'away', casError: 'unreachable' }).success).toBe(true)
  })

  it.each(TRANSPORTS)('describes every route as a GET with a summary in the %s transport', kind => {
    const { me, signIn, callback, logout } = authRouteFragments(kind)
    for (const fragment of [me, signIn, callback, logout]) {
      expect(fragment.method).toBe('get')
      expect(fragment.summary).not.toBe('')
      expect(fragment.description).not.toBe('')
      for (const response of Object.values(fragment.responses)) {
        expect(response.description).not.toBe('')
      }
    }
  })
})
