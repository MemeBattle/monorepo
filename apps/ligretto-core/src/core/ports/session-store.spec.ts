import { describe, expect, it } from 'vitest'

import { SessionBusyError } from './session-store'
import type { SessionBusyReason } from './session-store'

const REASONS: SessionBusyReason[] = ['lock_timeout', 'deadline', 'attempts']

describe('SessionBusyError', () => {
  it.each(REASONS)('carries the session_busy code and the %s reason', reason => {
    const cause = new Error('canceling statement due to lock timeout')
    const error = new SessionBusyError(reason, { cause })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SessionBusyError')
    expect(error.code).toBe('session_busy')
    expect(error.reason).toBe(reason)
    expect(error.cause).toBe(cause)
  })

  it.each(REASONS)('never puts a caller-provided value into the %s message', reason => {
    // The session id is a credential; whatever a caller hands in, the message stays the fixed text.
    const error = new SessionBusyError(reason, { cause: new Error('sess-secret-a') })
    expect(error.message).not.toContain('sess-secret-a')
    expect(error.message).toMatch(/^the session lock /)
  })
})
