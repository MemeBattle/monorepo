import { describe, expect, it } from 'vitest'

import { ApiError } from './ApiError'
import { shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it.each([
    [400, 'validation_failed'],
    [401, 'unauthorized'],
  ] as const)('does not retry a %i', (status, error) => {
    expect(shouldRetry(0, new ApiError({ kind: 'error', status, error }))).toBe(false)
  })

  it.each([
    ['a 503', new ApiError({ kind: 'error', status: 503, error: 'cas_unavailable' })],
    ['a transport failure', new ApiError({ kind: 'transport', status: undefined, error: undefined })],
    ['an error that is not an ApiError', new Error('boom')],
  ])('retries %s three times', (_, error) => {
    expect([0, 1, 2, 3].map(failureCount => shouldRetry(failureCount, error))).toEqual([true, true, true, false])
  })
})
