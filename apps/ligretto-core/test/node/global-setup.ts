// Boots the Node entry once for the suite: one child process on a free port, its output in a log file, and the base
// URL handed to the specs through `provide`. Vitest stores the returned teardown only after the setup resolves, so a
// setup that fails stops the child and closes the log itself before it rethrows.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    /** `http://127.0.0.1:<port>` of the booted entry. */
    nodeEntryUrl: string
  }
}

const READY_DEADLINE_MS = 60_000
const POLL_INTERVAL_MS = 250
const STOP_GRACE_MS = 5_000
const LOG_TAIL_LINES = 40

const packageDir = fileURLToPath(new URL('../../', import.meta.url))

type ExitInfo = { code: number | null; signal: NodeJS.Signals | null } | { error: Error }

/** A port nothing listens on right now: the kernel picks one, the probe server releases it. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('the probe server has no port'))
        }
      })
    })
  })

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** The last lines of the entry's log, for the error of a failed start. */
const logTail = (logPath: string) => {
  try {
    return fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n')
  } catch {
    return '(log unreadable)'
  }
}

const describeExit = (exit: ExitInfo) =>
  'error' in exit ? `could not be spawned: ${exit.error.message}` : `exited with code ${exit.code} / signal ${exit.signal}`

export default async function setup(project: TestProject) {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const logPath = process.env.LIGRETTO_CORE_NODE_LOG ?? path.join(os.tmpdir(), 'ligretto-core-node.log')
  const logFd = fs.openSync(logPath, 'w')

  let child: ChildProcess | undefined
  let exited: Promise<ExitInfo> | undefined
  let cleanedUp = false

  /** Stops the child (SIGTERM, then SIGKILL after the grace period) and closes the log. Safe to call twice. */
  const cleanup = async () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    try {
      if (child?.pid !== undefined && exited && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        let graceTimer: NodeJS.Timeout | undefined
        const graceOver = new Promise<false>(resolve => {
          graceTimer = setTimeout(() => resolve(false), STOP_GRACE_MS)
        })
        // Cleared once the race settles: a pending timer would keep vitest alive for the whole grace period.
        const stopped = await Promise.race([exited.then(() => true), graceOver]).finally(() => clearTimeout(graceTimer))
        if (!stopped) {
          child.kill('SIGKILL')
          await exited
        }
      }
    } finally {
      try {
        fs.closeSync(logFd)
      } catch {
        // A close error must not mask the one that brought us here.
      }
    }
  }

  try {
    // One Node process with the tsx loader, not the tsx CLI, which would run the entry in a second process that
    // killing this pid leaves listening. `--conditions=development` resolves @memebattle/ligretto-auth from source,
    // as `pnpm start:dev` does.
    child = spawn(process.execPath, ['--conditions=development', '--import', 'tsx', 'src/entry/node.ts'], {
      cwd: packageDir,
      // Vitest sets NODE_ENV=test, which would make the loader read .env.test; the job and `pnpm start:dev` run
      // without one, which it reads as development.
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
      stdio: ['ignore', logFd, logFd],
    })
    const spawned = child
    // Created before any await so no event is missed; the `error` listener also keeps a spawn failure from becoming
    // an unhandled `error` event.
    exited = new Promise<ExitInfo>(resolve => {
      spawned.once('exit', (code, signal) => resolve({ code, signal }))
      spawned.once('error', error => resolve({ error }))
    })

    const deadline = Date.now() + READY_DEADLINE_MS
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`did not answer /health within ${READY_DEADLINE_MS / 1000} s`)
      }
      // Any HTTP answer means it listens: a 503 without a database is the health spec's to report, not the setup's.
      const probe = await Promise.race([
        fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) }).then(
          () => ({ kind: 'ready' }) as const,
          () => ({ kind: 'not-yet' }) as const,
        ),
        exited.then(exit => ({ kind: 'exited', exit }) as const),
      ])
      if (probe.kind === 'ready') {
        break
      }
      if (probe.kind === 'exited') {
        throw new Error(describeExit(probe.exit))
      }
      await sleep(POLL_INTERVAL_MS)
    }
  } catch (cause) {
    await cleanup()
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      [
        `The Node entry ${reason} (pid ${child?.pid ?? 'none'}, port ${port}). Log: ${logPath}`,
        `--- last ${LOG_TAIL_LINES} lines ---`,
        logTail(logPath),
      ].join('\n'),
      { cause },
    )
  }

  project.provide('nodeEntryUrl', baseUrl)
  return cleanup
}
