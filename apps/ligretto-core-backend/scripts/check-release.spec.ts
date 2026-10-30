// scripts/check-release.sh against fixture build outputs and a stub `cf` first on PATH, which answers from the scenario
// a case gives it and records every call, so a case can also prove that `cf` was never reached.
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./check-release.sh', import.meta.url))

const MAIN_ID = 'a'.repeat(32)
const LOCKS_ID = 'b'.repeat(32)
const PLACEHOLDER_ID = '0'.repeat(32)
const SECRETS = ['DATABASE_URL', 'LIGRETTO_CAS_CLIENT_SECRET', 'LIGRETTO_INTERNAL_API_TOKEN']

const hyperdrive = (name: string, limit: number, caching: unknown = { disabled: true }) =>
  JSON.stringify({ name, origin_connection_limit: limit, caching })

type Scenario = {
  mode?: string
  mainId?: string
  locksId?: string
  /** Each is what `cf hyperdrive get` prints for that id; null makes the command fail. */
  main?: string | null
  locks?: string | null
  /** The names `cf workers secrets list` prints; null makes the command fail. */
  set?: string[] | null
}

const STUB = `#!/usr/bin/env bash
echo "$*" >>"$SCENARIO/calls"
case "$1 $2" in
  'hyperdrive get') file="$SCENARIO/hyperdrive-$3" ;;
  'workers secrets') file="$SCENARIO/secrets" ;;
  *) echo "unexpected cf call: $*" >&2; exit 2 ;;
esac
[[ -f "$file" ]] || { echo 'not found' >&2; exit 1; }
cat "$file"
`

let root = ''
let bin = ''

const check = async ({
  mode = 'production',
  mainId = MAIN_ID,
  locksId = LOCKS_ID,
  main = hyperdrive('main', 15),
  locks = hyperdrive('locks', 10),
  set = SECRETS,
}: Scenario = {}) => {
  const scenario = await fs.mkdtemp(path.join(root, 'case-'))
  const output = path.join(scenario, 'output')
  await fs.mkdir(path.join(output, 'v0/workers/default'), { recursive: true })
  await fs.writeFile(path.join(output, 'v0/config.json'), JSON.stringify({ buildContext: { isPreview: false, mode } }))
  await fs.writeFile(
    path.join(output, 'v0/workers/default/worker.config.json'),
    JSON.stringify({
      name: 'the-worker',
      env: {
        HYPERDRIVE_MAIN: { type: 'hyperdrive', id: mainId },
        HYPERDRIVE_LOCKS: { type: 'hyperdrive', id: locksId },
        LOG_LEVEL: { type: 'text', value: 'info' },
        ...Object.fromEntries(SECRETS.map(name => [name, { type: 'secret' }])),
      },
    }),
  )
  if (main !== null) {
    await fs.writeFile(path.join(scenario, `hyperdrive-${mainId}`), main)
  }
  if (locks !== null) {
    await fs.writeFile(path.join(scenario, `hyperdrive-${locksId}`), locks)
  }
  if (set !== null) {
    await fs.writeFile(path.join(scenario, 'secrets'), JSON.stringify(set.map(name => ({ name, type: 'secret_text' }))))
  }

  const { code, output: printed } = await new Promise<{ code: number; output: string }>(resolve => {
    execFile(
      'bash',
      [script, output],
      { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SCENARIO: scenario } },
      (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` })
      },
    )
  })
  const calls = await fs.readFile(path.join(scenario, 'calls'), 'utf8').catch(() => '')
  return { code, output: printed, calls }
}

describe('check-release.sh', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ligretto-core-check-release-'))
    bin = path.join(root, 'bin')
    await fs.mkdir(bin)
    await fs.writeFile(path.join(bin, 'cf'), STUB, { mode: 0o755 })
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('passes when both configurations are cache-disabled and every declared secret is set', async () => {
    const result = await check()
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('HYPERDRIVE_MAIN: main, caching disabled, origin_connection_limit 15')
    expect(result.output).toContain('HYPERDRIVE_LOCKS: locks, caching disabled, origin_connection_limit 10')
    expect(result.calls).toContain('workers secrets list --worker the-worker')
  })

  it('passes with an extra secret the build does not declare', async () => {
    const result = await check({ set: [...SECRETS, 'LEFT_OVER'] })
    expect(result.code, result.output).toBe(0)
  })

  it('fails a configuration with caching enabled, naming its binding', async () => {
    const result = await check({ locks: hyperdrive('locks', 10, { disabled: false }) })
    expect(result.code).toBe(1)
    expect(result.output).toContain('::error::HYPERDRIVE_LOCKS')
    expect(result.output).toContain('caching enabled')
  })

  it('fails a configuration with no caching object, which is how the API reports the default', async () => {
    const result = await check({ main: JSON.stringify({ name: 'main', origin_connection_limit: 15 }) })
    expect(result.code).toBe(1)
    expect(result.output).toContain('::error::HYPERDRIVE_MAIN')
  })

  it('fails when a configuration cannot be read', async () => {
    const result = await check({ locks: null })
    expect(result.code).toBe(1)
    expect(result.output).toContain('::error::HYPERDRIVE_LOCKS: could not read')
  })

  it('fails a missing secret, naming that one and no other', async () => {
    const result = await check({ set: SECRETS.filter(name => name !== 'LIGRETTO_CAS_CLIENT_SECRET') })
    expect(result.code).toBe(1)
    expect(result.output).toContain('::error::the secret LIGRETTO_CAS_CLIENT_SECRET is not set')
    expect(result.output).not.toContain('the secret LIGRETTO_INTERNAL_API_TOKEN')
    expect(result.output).not.toContain('the secret DATABASE_URL')
  })

  it('names every missing secret at once', async () => {
    const result = await check({ set: ['DATABASE_URL'] })
    expect(result.code).toBe(1)
    expect(result.output).toContain('the secret LIGRETTO_CAS_CLIENT_SECRET')
    expect(result.output).toContain('the secret LIGRETTO_INTERNAL_API_TOKEN')
  })

  it('fails when the secrets cannot be listed, as for a Worker that does not exist', async () => {
    const result = await check({ set: null })
    expect(result.code).toBe(1)
    expect(result.output).toContain('could not list the secrets of Worker the-worker')
  })

  it.each<[string, Scenario, string]>([
    ['the placeholder id', { mainId: PLACEHOLDER_ID }, 'HYPERDRIVE_MAIN has no real Hyperdrive id'],
    ['a malformed id', { locksId: 'nope' }, 'HYPERDRIVE_LOCKS has no real Hyperdrive id'],
    ['identical ids', { locksId: MAIN_ID }, 'share the id'],
    ['another build mode', { mode: 'development' }, "built in mode 'development'"],
  ])('fails %s without calling cf', async (_name, scenario, message) => {
    const result = await check(scenario)
    expect(result.code).toBe(1)
    expect(result.output).toContain(message)
    expect(result.calls).toBe('')
  })

  it('fails an output directory with no build', async () => {
    const empty = await fs.mkdtemp(path.join(root, 'empty-'))
    const code = await new Promise<number>(resolve => {
      execFile('bash', [script, empty], error => resolve(error ? 1 : 0))
    })
    expect(code).toBe(1)
  })
})
