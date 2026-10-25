// The isolated contract test: this file imports the contract and zod only.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { sessionBusySchema } from './auth'
import { authUserSchema, casUnavailableSchema, listUsersQuerySchema, MAX_USER_IDS, unauthorizedSchema } from './users'

const ids = (count: number) => Array.from({ length: count }, (_, index) => `sub-${index}`)

const issuePaths = (result: z.ZodSafeParseResult<unknown>) => (result.success ? [] : result.error.issues.map(issue => issue.path.join('.')))

describe('listUsersQuerySchema', () => {
  it('reads a single value as a one-element array', () => {
    expect(listUsersQuerySchema.parse({ ids: 'alice' })).toEqual({ ids: ['alice'] })
  })

  it('accepts repeated values', () => {
    expect(listUsersQuerySchema.parse({ ids: ['alice', 'bob'] })).toEqual({ ids: ['alice', 'bob'] })
  })

  it(`accepts ${MAX_USER_IDS} values`, () => {
    expect(listUsersQuerySchema.parse({ ids: ids(MAX_USER_IDS) }).ids).toHaveLength(MAX_USER_IDS)
  })

  it.each([
    ['no values', { ids: [] }],
    ['a missing ids', {}],
    ['an empty value', { ids: [''] }],
    ['a single empty value', { ids: '' }],
    [`${MAX_USER_IDS + 1} values`, { ids: ids(MAX_USER_IDS + 1) }],
  ])('refuses %s with an issue at ids', (_name, query) => {
    expect(issuePaths(listUsersQuerySchema.safeParse(query))[0]).toMatch(/^ids/)
  })
})

describe('the error bodies', () => {
  it('require their code', () => {
    expect(unauthorizedSchema.safeParse({ error: 'unauthorized' }).success).toBe(true)
    expect(unauthorizedSchema.safeParse({ error: 'cas_unavailable' }).success).toBe(false)
    expect(casUnavailableSchema.safeParse({ error: 'cas_unavailable' }).success).toBe(true)
    expect(sessionBusySchema.safeParse({ error: 'session_busy' }).success).toBe(true)
  })
})

it('registers the component ids the OpenAPI document renders', () => {
  const registered = [authUserSchema, unauthorizedSchema, casUnavailableSchema, sessionBusySchema].map(schema => z.globalRegistry.get(schema)?.id)
  expect(registered).toEqual(['AuthUser', 'Unauthorized', 'CasUnavailable', 'SessionBusy'])
})
