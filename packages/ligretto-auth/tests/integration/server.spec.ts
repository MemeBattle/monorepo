/**
 * The one thing about the test fixture itself worth pinning: how it answers a handler that threw.
 *
 * Unanswered, such a request leaves the socket open, and a story with a 120 s timeout then fails as that timeout with
 * an unhandled rejection attributed to whichever test was running — the opposite of what this suite exists for, which
 * is to name what CAS or the package got wrong. Needs no CAS.
 */

import { expect, it } from 'vitest'
import { startAppServer } from './server'

it('answers a handler that threw with a 500 carrying the failure', async () => {
  const failing = async (): Promise<Response> => {
    throw new Error('the handler exploded')
  }
  // Never cast: this literal is where `tests/` is checked against the real route surface, and a cast would let a
  // renamed or added route compile into a test that only ever requests `/auth/me`.
  const server = await startAppServer({ me: failing, signIn: failing, callback: failing, logout: failing })
  try {
    const response = await fetch(`${server.baseUrl}/auth/me`, { redirect: 'manual' })
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(await response.text()).toContain('the handler exploded')
  } finally {
    await server.close()
  }
}, 10_000)
