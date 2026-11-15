import type { describeFailure } from './describeFailure'

type Failure = ReturnType<typeof describeFailure>

/** A failed core API call thrown into TanStack Query. It carries only what `describeFailure` keeps, never a body. */
export class ApiError extends Error {
  readonly failure: Failure

  constructor(failure: Failure) {
    super(['API call failed:', failure.kind, failure.status, failure.error].filter(part => part !== undefined).join(' '))
    this.name = 'ApiError'
    this.failure = failure
  }
}
