// Runs the Worker fixture under `wrangler dev` for the suite. It follows the core backend's test/node/global-setup.ts,
// with one difference: Wrangler spawns a child that spawns `workerd`, so the child starts its own process group and
// every signal goes to the group. That group does not get the terminal's signal, hence the handlers on this process.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    /** `http://127.0.0.1:<port>` of the Worker fixture. */
    workerdOrigin: string
  }
}

const READY_DEADLINE_MS = 120_000
const POLL_INTERVAL_MS = 250
const PROBE_TIMEOUT_MS = 5_000
const STOP_GRACE_MS = 5_000
const LOG_TAIL_LINES = 40
const SIGNAL_EXIT_CODES = new Map<NodeJS.Signals, number>([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
])

type ExitInfo = { code: number | null; signal: NodeJS.Signals | null } | { error: Error }

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

const logTail = (logPath: string) => {
  try {
    return fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n')
  } catch {
    return '(log unreadable)'
  }
}

const describeExit = (exit: ExitInfo) =>
  'error' in exit ? `could not be spawned: ${exit.error.message}` : `exited with code ${exit.code} / signal ${exit.signal}`

const signalGroup = (child: ChildProcess | undefined, signal: NodeJS.Signals) => {
  if (child?.pid === undefined) {
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    // The whole group is gone already.
  }
}

export default async function setup(project: TestProject) {
  const port = await freePort()
  const inspectorPort = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const packageDir = project.config.root
  const logPath = path.join(os.tmpdir(), `ligretto-transport-workerd-${port}.log`)
  const logFd = fs.openSync(logPath, 'w')

  let child: ChildProcess | undefined
  let exited: Promise<ExitInfo> | undefined
  let cleanedUp = false

  const killGroup = () => signalGroup(child, 'SIGKILL')
  const onSignal = (signal: NodeJS.Signals) => {
    killGroup()
    process.exit(SIGNAL_EXIT_CODES.get(signal))
  }
  process.once('exit', killGroup)
  for (const signal of SIGNAL_EXIT_CODES.keys()) {
    process.once(signal, onSignal)
  }

  const cleanup = async () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    process.removeListener('exit', killGroup)
    for (const signal of SIGNAL_EXIT_CODES.keys()) {
      process.removeListener(signal, onSignal)
    }
    try {
      if (exited) {
        signalGroup(child, 'SIGTERM')
        let graceTimer: NodeJS.Timeout | undefined
        const graceOver = new Promise<void>(resolve => {
          graceTimer = setTimeout(resolve, STOP_GRACE_MS)
        })
        await Promise.race([exited, graceOver]).finally(() => clearTimeout(graceTimer))
        // Wrangler can exit before `workerd` does, so the group gets this even when the direct child is gone.
        killGroup()
      }
    } finally {
      try {
        fs.closeSync(logFd)
      } catch {
        // A close error must not mask the error that triggered the cleanup.
      }
    }
  }

  try {
    child = spawn(
      'node_modules/.bin/wrangler',
      [
        'dev',
        '--config',
        'test/transport/worker/wrangler.jsonc',
        '--local',
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        String(inspectorPort),
        '--log-level',
        'warn',
        '--show-interactive-dev-session=false',
      ],
      { cwd: packageDir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', logFd, logFd] },
    )
    const spawned = child
    exited = new Promise<ExitInfo>(resolve => {
      spawned.once('exit', (code, signal) => resolve({ code, signal }))
      spawned.once('error', error => resolve({ error }))
    })

    const deadline = Date.now() + READY_DEADLINE_MS
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`did not answer /health within ${READY_DEADLINE_MS / 1000} s`)
      }
      const probe = await Promise.race([
        fetch(`${origin}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then(
          response => (response.ok ? ({ kind: 'ready' } as const) : ({ kind: 'not-yet' } as const)),
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
        `wrangler dev ${reason} (pid ${child?.pid ?? 'none'}, port ${port}). Log: ${logPath}`,
        `--- last ${LOG_TAIL_LINES} lines ---`,
        logTail(logPath),
      ].join('\n'),
      { cause },
    )
  }

  project.provide('workerdOrigin', origin)
  return cleanup
}
