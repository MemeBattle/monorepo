/**
 * The generated `x-error-codes` map against the description it was generated from. It lives here rather than next to
 * the file it checks because kubb empties `src/generated` on every run.
 */

import { describe, expect, it } from 'vitest'
import spec from '../../../apps/cas/openapi.json'
import { errorCodes } from './generated/error-codes'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

/** Every `'<METHOD> <path>': { status: codes }` the description carries for the mirrored paths. */
const fromTheDescription = (): Record<string, Record<string, string[]>> => {
  const operations: Record<string, Record<string, string[]>> = {}
  for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
    if (!path.startsWith('/oidc/') && !path.startsWith('/.well-known/')) {
      continue
    }
    for (const method of METHODS) {
      const operation = item[method] as { responses?: Record<string, { 'x-error-codes'?: string[] }> } | undefined
      if (operation === undefined) {
        continue
      }
      const statuses: Record<string, string[]> = {}
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const codes = response['x-error-codes']
        if (codes !== undefined) {
          statuses[status] = [...codes].sort()
        }
      }
      if (Object.keys(statuses).length > 0) {
        operations[`${method.toUpperCase()} ${path}`] = statuses
      }
    }
  }
  return operations
}

/** The generated map in the same shape, so a missing operation, status or code shows up as a difference. */
const fromTheGeneratedMap = (): Record<string, Record<string, string[]>> =>
  Object.fromEntries(
    Object.entries(errorCodes).map(([operation, statuses]) => [
      operation,
      Object.fromEntries(Object.entries(statuses as Record<string, readonly string[]>).map(([status, codes]) => [status, [...codes].sort()])),
    ]),
  )

describe('the generated error-codes map', () => {
  it('carries exactly the `x-error-codes` of the mirrored paths — nothing missing, nothing extra', () => {
    expect(fromTheGeneratedMap()).toEqual(fromTheDescription())
  })

  it("keeps the codes of the `302`, which has no body at all: they ride in the redirect's `error` parameter", () => {
    expect(errorCodes['GET /oidc/authorize']['302']).toEqual([
      'invalid_request',
      'invalid_scope',
      'login_required',
      'registration_not_supported',
      'request_not_supported',
      'request_uri_not_supported',
      'server_error',
      'temporarily_unavailable',
      'unauthorized_client',
      'unsupported_response_type',
    ])
  })

  it('keeps the codes of the HTML pages, which no response schema describes', () => {
    expect(errorCodes['GET /oidc/authorize']['400']).toEqual(['invalid_redirect_uri', 'invalid_request', 'unknown_client'])
    expect(errorCodes['GET /oidc/authorize']['503']).toEqual(['service_unavailable'])
    expect(errorCodes['GET /oidc/end_session']['400']).toEqual(['invalid_redirect_uri', 'invalid_request', 'unknown_client'])
    expect(errorCodes['GET /oidc/end_session']['503']).toEqual(['service_unavailable'])
  })
})
