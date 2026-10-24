// The migrate and codegen entries as `pnpm migrate` and `pnpm db:codegen` run them, against the disposable Postgres.
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'

import { disposableDatabaseUrl, resetDatabase } from '../support/disposable-database'

const packageDir = fileURLToPath(new URL('../../', import.meta.url))
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))
const url = disposableDatabaseUrl()
const CLOSED_PORT_URL = 'postgres://ligretto-core-user:x@127.0.0.1:1/nothing-test'

type Run = { code: number; stdout: string; stderr: string }

/** Runs an entry with DATABASE_URL set in its environment, which the shared loader lets win over every file. */
const runEntry = (entry: string, databaseUrl: string, args: string[] = []) =>
  new Promise<Run>(resolve => {
    execFile(tsx, [entry, ...args], { cwd: packageDir, env: { ...process.env, DATABASE_URL: databaseUrl } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })
    })
  })

/** The JSON log lines of a run. */
const lines = (output: string) =>
  output
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line) as Record<string, unknown>)

const query = async <R extends pg.QueryResultRow>(text: string, values: unknown[] = []) => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query<R>(text, values)).rows
  } finally {
    await client.end()
  }
}

describe('the migrate entry', () => {
  beforeAll(async () => {
    await resetDatabase(url)
  })

  it('creates the schema on an empty database, then has nothing to do', async () => {
    const first = await runEntry('src/entry/migrate.ts', url)
    expect(first.code, first.stderr).toBe(0)
    // Not the exact lists: the code-previous CI job runs this spec of master on the schema of a pull request, which
    // may add migrations and tables. The committed row types pin the schema (the codegen diff of schema-current).
    const applied = lines(first.stdout).filter(line => line.message === 'migration')
    expect(applied.length).toBeGreaterThan(0)
    for (const line of applied) {
      expect(line).toMatchObject({ status: 'Success', direction: 'Up' })
    }
    expect(applied[0]).toMatchObject({ name: expect.stringMatching(/_initial_schema$/) })

    const tables = await query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    )
    expect(tables.map(row => row.table_name)).toEqual(
      expect.arrayContaining([
        'auth_requests',
        'games',
        'kysely_migration',
        'kysely_migration_lock',
        'round_users',
        'rounds',
        'session_locks',
        'sessions',
        'users',
      ]),
    )

    const sessionColumns = await query<{ column_name: string; is_nullable: string }>(
      "select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'sessions'",
    )
    const nullable = Object.fromEntries(sessionColumns.map(row => [row.column_name, row.is_nullable]))
    expect(nullable).toMatchObject({ display_name: 'YES', avatar_url: 'YES', account_type: 'NO' })

    const second = await runEntry('src/entry/migrate.ts', url)
    expect(second.code, second.stderr).toBe(0)
    expect(lines(second.stdout).map(line => line.message)).toEqual(['no pending migrations'])
  })

  it('matches the committed row types on the database it migrated', async () => {
    const run = await runEntry('src/entry/codegen.ts', url, ['--verify'])
    expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0)
  })

  it('exits non-zero and logs migration_failed when the database is unreachable', async () => {
    const run = await runEntry('src/entry/migrate.ts', CLOSED_PORT_URL)
    expect(run.code).not.toBe(0)
    expect(lines(run.stderr).map(line => line.message)).toContain('migration_failed')
  })

  it('exits non-zero and logs codegen_failed when the database is unreachable', async () => {
    const run = await runEntry('src/entry/codegen.ts', CLOSED_PORT_URL)
    expect(run.code).not.toBe(0)
    expect(lines(run.stderr).map(line => line.message)).toContain('codegen_failed')
  })
})
