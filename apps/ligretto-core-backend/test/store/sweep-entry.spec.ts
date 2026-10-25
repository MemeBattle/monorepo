// The sweep entry as `pnpm sweep` runs it, against the disposable Postgres.
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPgSessionStore } from '../../src/adapters/pg/session-store.ts'
import { systemClock } from '../../src/adapters/system-clock.ts'
import { disposableDatabaseUrl } from '../support/disposable-database.ts'
import { openHandles, resetAndMigrate } from '../support/postgres.ts'
import type { OpenHandles } from '../support/postgres.ts'
import { sessionOf } from '../support/session-store.ts'

const packageDir = fileURLToPath(new URL('../../', import.meta.url))
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))
const url = disposableDatabaseUrl()
const CLOSED_PORT_URL = 'postgres://ligretto-core-user:x@127.0.0.1:1/nothing-test'

type Run = { code: number; stdout: string; stderr: string }

/** Runs the entry with the arguments of the `sweep` script and DATABASE_URL in its environment. */
const runSweep = (databaseUrl: string) =>
  new Promise<Run>(resolve => {
    execFile(
      tsx,
      ['--conditions=development', 'src/entry/sweep.ts'],
      { cwd: packageDir, env: { ...process.env, DATABASE_URL: databaseUrl } },
      (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })
      },
    )
  })

/** The JSON log lines of a run. */
const lines = (output: string) =>
  output
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line) as Record<string, unknown>)

describe('the sweep entry', () => {
  let handles: OpenHandles

  beforeAll(async () => {
    await resetAndMigrate(url)
    handles = openHandles(url)
  })

  afterAll(async () => {
    await handles.close()
  })

  it('removes what is expired and nothing else, then has nothing to do', async () => {
    // The entry runs on the wall clock, so the fixtures are placed around it.
    const now = Date.now()
    const store = createPgSessionStore(handles, { clock: systemClock })
    const request = { codeVerifier: 'a-verifier', nonce: 'a-nonce', sessionId: null, sub: null }
    await store.savePendingRequest({ ...request, state: 'expired', expiresAt: now - 60_000 })
    await store.savePendingRequest({ ...request, state: 'live', expiresAt: now + 3_600_000 })
    await store.saveSession(sessionOf({ id: 'sess-secret-a', sub: 'account-a', grantEndsAt: now - SESSION_COOKIE_GRACE_MS - 60_000 }))
    await store.saveSession(sessionOf({ id: 'sess-secret-b', sub: 'account-b', grantEndsAt: now - 60_000 }))
    await handles.main.insertInto('session_locks').values({ id: 'orphaned' }).execute()

    const first = await runSweep(url)
    expect(first.code, first.stderr).toBe(0)
    expect(lines(first.stdout)).toContainEqual(
      expect.objectContaining({ message: 'sweep_completed', authRequests: 1, sessions: 1, sessionLocks: 1, failedSessions: 0 }),
    )
    expect(`${first.stdout}${first.stderr}`).not.toContain('sess-secret-')

    expect(await handles.main.selectFrom('auth_requests').select('state').execute()).toEqual([{ state: 'live' }])
    expect(await handles.main.selectFrom('sessions').select('id').execute()).toEqual([{ id: 'sess-secret-b' }])
    expect(await handles.main.selectFrom('session_locks').select('id').execute()).toEqual([])
    expect((await handles.main.selectFrom('users').select('cas_id').orderBy('cas_id').execute()).map(row => row.cas_id)).toEqual([
      'account-a',
      'account-b',
    ])

    const second = await runSweep(url)
    expect(second.code, second.stderr).toBe(0)
    expect(lines(second.stdout)).toContainEqual(
      expect.objectContaining({ message: 'sweep_completed', authRequests: 0, sessions: 0, sessionLocks: 0, failedSessions: 0 }),
    )
  })

  it('exits non-zero and logs sweep_failed when the database is unreachable', async () => {
    const run = await runSweep(CLOSED_PORT_URL)
    expect(run.code).not.toBe(0)
    expect(lines(run.stderr).map(line => line.message)).toContain('sweep_failed')
  })
})
