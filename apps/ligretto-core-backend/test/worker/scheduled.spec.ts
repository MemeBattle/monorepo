// The cron handler under workerd: the sweep use case reaches both Hyperdrive bindings inside a request scope. Like the
// rest of this suite it proves the wiring. src/core/sweep.spec.ts and the store suite cover behaviour, and
// src/entry/request-scope.spec.ts covers closing the clients. The case needs a session past the cookie grace, because
// only deleting a session opens `HYPERDRIVE_LOCKS`.
import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import type { Session, SessionStore } from '@memebattle/ligretto-auth'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { createPgSessionStore } from '../../src/adapters/pg/session-store.ts'
import { systemClock } from '../../src/adapters/system-clock.ts'
import { createRequestScopeRunner } from '../../src/entry/request-scope.ts'
import type { WorkerEnv } from '../../src/entry/worker.ts'

/**
 * The Worker's own default export. `Fetcher` of the Workers types does not declare `scheduled`, and the test pool calls
 * the handler directly: a failed sweep rejects here, where the runtime would report the outcome `exception`.
 */
const worker = (exports as unknown as { default: { scheduled(options: { cron: string }): Promise<void> } }).default
const bindings = env as unknown as WorkerEnv

/** Runs `use` on the session store the service composes, in a scope of its own over the same two bindings. */
const withStore = async <T>(use: (store: SessionStore) => Promise<T>): Promise<T> => {
  const runner = createRequestScopeRunner()
  const closing: Promise<unknown>[] = []
  const result = await runner.run(
    { main: bindings.HYPERDRIVE_MAIN.connectionString, locks: bindings.HYPERDRIVE_LOCKS.connectionString },
    promise => closing.push(promise),
    () => use(createPgSessionStore(runner.handles, { clock: systemClock })),
  )
  await Promise.all(closing)
  return result
}

// Fixed values: a save is an upsert, so a rerun on a developer's database adds no rows.
const pastTheGrace = (): Session => ({
  id: 'worker-smoke-swept-session',
  sub: 'worker-smoke-swept-account',
  accountType: 'full',
  displayName: null,
  avatarUrl: null,
  refreshToken: 'a-refresh-token',
  accessToken: 'an-access-token',
  accessTokenExpiresAt: 0,
  grantEndsAt: Date.now() - SESSION_COOKIE_GRACE_MS - 1,
  idToken: 'an-id-token',
  createdAt: 0,
})

describe('the scheduled handler', () => {
  it('removes a session past the cookie grace, under a lock on the second binding', async () => {
    const session = pastTheGrace()
    await withStore(store => store.saveSession(session))

    await expect(worker.scheduled({ cron: '7 * * * *' })).resolves.toBeUndefined()

    // A failed lock does not reject: the sweep logs the session and leaves it, so the assertion is on the row.
    expect(await withStore(store => store.getSession(session.id))).toBeUndefined()
  })
})
