// The isolated contract test: this file imports the contract and zod only, so the contract is proven to load and parse
// with nothing of hono, src/http or src/core in its module graph.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { internalErrorSchema, validationFailedSchema } from './error'
import { healthReportSchema } from './health'

describe('healthReportSchema', () => {
  it('accepts an ok report', () => {
    expect(healthReportSchema.parse({ status: 'ok', checks: { database: { status: 'ok', durationMs: 3 } } })).toEqual({
      status: 'ok',
      checks: { database: { status: 'ok', durationMs: 3 } },
    })
  })

  it('accepts a failed check with its error', () => {
    const report = { status: 'unavailable', checks: { database: { status: 'failed', durationMs: 2000, error: 'timeout' } } }
    expect(healthReportSchema.parse(report)).toEqual(report)
  })

  it('rejects an unknown status', () => {
    expect(healthReportSchema.safeParse({ status: 'degraded', checks: { database: { status: 'ok', durationMs: 3 } } }).success).toBe(false)
  })

  it('rejects a report without checks', () => {
    expect(healthReportSchema.safeParse({ status: 'ok' }).success).toBe(false)
  })

  it('carries the component metadata the OpenAPI document will render', () => {
    expect(z.globalRegistry.get(healthReportSchema)?.id).toBe('HealthReport')
  })
})

describe('error schemas', () => {
  it('accepts the validation hook body and rejects another code', () => {
    const body = {
      error: 'validation_failed',
      description: 'The request does not match the route schema',
      issues: [{ path: 'n', message: 'Invalid input', code: 'invalid_type' }],
    }
    expect(validationFailedSchema.safeParse(body).success).toBe(true)
    expect(validationFailedSchema.safeParse({ ...body, error: 'other' }).success).toBe(false)
  })

  it('requires the request id on an internal error', () => {
    expect(internalErrorSchema.safeParse({ error: 'internal_error', description: 'Unexpected failure' }).success).toBe(false)
    expect(internalErrorSchema.safeParse({ error: 'internal_error', requestId: 'abc' }).success).toBe(true)
  })

  it('registers the error components', () => {
    expect(z.globalRegistry.get(validationFailedSchema)?.id).toBe('ValidationFailed')
    expect(z.globalRegistry.get(internalErrorSchema)?.id).toBe('InternalError')
  })
})
