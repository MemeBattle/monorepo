import { describe, expect, it } from 'vitest'

import { describeFailure, type FailedResult } from './describeFailure'

const headers = new Headers()

describe('describeFailure', () => {
  it('logs the kind, the status and the error code of a declared error, never the rest of its body', () => {
    const result: FailedResult = {
      kind: 'error',
      ok: false,
      status: 503,
      headers,
      error: { error: 'cas_unavailable', description: 'CAS is down' },
    }

    expect(describeFailure(result)).toEqual({ kind: 'error', status: 503, error: 'cas_unavailable' })
  })

  it('logs the kind and the status of an unexpected answer, never its body', () => {
    const result: FailedResult = { kind: 'unexpected', ok: false, status: 418, headers, body: '{"accessToken":"t"}' }

    expect(describeFailure(result)).toEqual({ kind: 'unexpected', status: 418, error: undefined })
  })

  it('logs the kind and the status of a redirect', () => {
    const result: FailedResult = { kind: 'redirect', ok: false, status: 0, headers, location: null }

    expect(describeFailure(result)).toEqual({ kind: 'redirect', status: 0, error: undefined })
  })

  it('logs only the kind of a transport failure', () => {
    const result: FailedResult = { kind: 'transport', ok: false, cause: new TypeError('Failed to fetch') }

    expect(describeFailure(result)).toEqual({ kind: 'transport', status: undefined, error: undefined })
  })
})
