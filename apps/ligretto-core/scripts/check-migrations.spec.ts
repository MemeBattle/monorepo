// scripts/check-migrations.sh against real git: a scratch repository with master's baseline migration, one branch per
// case with its fixture committed, the script run from the scratch root against `master`.
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./check-migrations.sh', import.meta.url))
const baselineSource = fileURLToPath(new URL('../migrations/20261024175957_initial_schema.ts', import.meta.url))
const migrationsDir = 'apps/ligretto-core/migrations'
const baseline = `${migrationsDir}/20261024175957_initial_schema.ts`

type Run = { code: number; output: string }

// No GIT_* variable of the caller (a hook sets GIT_DIR and GIT_INDEX_FILE) and no user or system config reach the
// scratch repository.
const gitEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: os.devNull,
}

const run = (file: string, args: string[], cwd: string) =>
  new Promise<Run>(resolve => {
    execFile(file, args, { cwd, env: gitEnv }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` })
    })
  })

let root = ''

const git = async (...args: string[]) => {
  const result = await run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], root)
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.output}`)
  }
}

const write = async (file: string, content: string) => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), content)
}

/** A migration whose `up` has the given body, in the shape of docs/MIGRATIONS.md § Adding one. */
const migration = (body: string) => `import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
${body}
}
`

/** One statement in a one-line `sql` tag. */
const oneLine = (statement: string) => migration(`  await sql\`${statement}\`.execute(db)`)

/** Statement lines inside a multiline `sql` tag, as the baseline writes them. */
const tag = (...lines: string[]) => migration(`  await sql\`\n${lines.map(line => `    ${line}`).join('\n')}\n  \`.execute(db)`)

const MARKER = '-- contract: removes users.locale, unused since 0.3.0'

/**
 * Runs the script on a branch off master that `change` prepared; the change is committed unless `commit` is false.
 * The scratch tree is back on a clean master afterwards.
 */
const checkBranch = async (change: () => Promise<void>, { commit = true } = {}) => {
  await git('checkout', '-q', '-b', `case-${Math.random().toString(36).slice(2)}`, 'master')
  try {
    await change()
    if (commit) {
      await git('add', '-A')
      await git('commit', '-q', '-m', 'case')
    }
    return await run('bash', [script, 'master'], root)
  } finally {
    await git('reset', '-q', '--hard')
    await git('clean', '-q', '-f', '-d')
    await git('checkout', '-q', 'master')
  }
}

const addMigration = (name: string, content: string) => checkBranch(() => write(`${migrationsDir}/${name}`, content))

const NEW = '20261101000000_add_users_locale.ts'

describe('check-migrations.sh', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ligretto-core-check-migrations-'))
    await git('init', '-q', '-b', 'master')
    await write(baseline, await fs.readFile(baselineSource, 'utf8'))
    await git('add', '-A')
    await git('commit', '-q', '-m', 'baseline')
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('passes a branch that does not touch the migrations', async () => {
    const result = await checkBranch(() => write('README.md', 'unrelated\n'))
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('No migration changes against master.')
  })

  it('does not see a migration that is staged but not committed', async () => {
    const result = await checkBranch(
      async () => {
        await write(`${migrationsDir}/${NEW}`, oneLine('alter table users drop column locale'))
        await git('add', '-A')
      },
      { commit: false },
    )
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('No migration changes against master.')
  })

  it('passes a newer, well-named, additive migration', async () => {
    const result = await addMigration(NEW, oneLine('alter table users add column locale text'))
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('newer than master (newest 20261024175957)')
  })

  describe('immutability', () => {
    it('fails an edit of a migration on master', async () => {
      const result = await checkBranch(async () => {
        await fs.appendFile(path.join(root, baseline), '// an afterthought\n')
      })
      expect(result.code).toBe(1)
      expect(result.output).toContain(baseline)
      expect(result.output).toContain('is never edited, renamed or deleted')
    })

    it('fails a deletion of a migration on master', async () => {
      const result = await checkBranch(() => git('rm', '-q', baseline))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`${baseline} is on master and changed (D)`)
    })

    it('fails a rename of a migration on master', async () => {
      const result = await checkBranch(() => git('mv', baseline, `${migrationsDir}/20261024175957_baseline.ts`))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`${baseline} is on master and changed (D)`)
    })
  })

  describe('order', () => {
    it.each(['20261024175957_again.ts', '20200101000000_old.ts'])('fails %s, not newer than master', async name => {
      const result = await addMigration(name, oneLine('alter table users add column locale text'))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`<= 20261024175957 (the newest migration on master)`)
      expect(result.output).toContain('date -u +%Y%m%d%H%M%S')
    })
  })

  describe('naming', () => {
    it.each(['notes.md', 'add_locale.ts'])('fails %s', async name => {
      const result = await addMigration(name, oneLine('alter table users add column locale text'))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`${migrationsDir}/${name} does not follow the <yyyymmddHHMMSS>_<name>.ts naming convention`)
    })
  })

  describe('contract statements', () => {
    it.each([
      ['alter table users drop column locale', 'drop'],
      ['alter table users rename column a to b', 'rename'],
      ['alter table users alter column score type bigint', 'alter column score type'],
      ['alter table users alter column score set data type bigint', 'alter column score set data type'],
      ['alter table users alter column display_name set not null', 'set not null'],
      ['alter table users alter column locale drop not null', 'drop'],
      ['alter table round_users alter score type bigint', 'alter score type'],
      ['alter table users alter column display_name set /* backfilled */ not null', 'set not null'],
      ['alter table round_users alter column score /* widened */ type bigint', 'alter column score type'],
      ["alter table users alter column homepage set default 'https://example.com', drop column locale", 'drop'],
    ])('fails `%s` without a marker', async (statement, fragment) => {
      const result = await addMigration(NEW, oneLine(statement))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement '${fragment}' with no leading marker`)
    })

    it.each([
      [['ALTER TABLE users ALTER COLUMN display_name', 'SET NOT', 'NULL'], 'SET NOT NULL'],
      [['ALTER TABLE round_users ALTER COLUMN score', 'TYPE bigint'], 'ALTER COLUMN score TYPE'],
      [['alter table round_users alter column "score"', 'set data type bigint'], 'alter column "score" set data type'],
    ])('fails %j, split over lines, without a marker', async (lines, fragment) => {
      const result = await addMigration(NEW, tag(...lines))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement '${fragment}' with no leading marker`)
    })

    it.each([
      ['alter table users drop column locale'],
      ['alter table users rename column a to b'],
      ['alter table users alter column score type bigint'],
      ['alter table users alter column score set data type bigint'],
      ['alter table users alter column display_name set not null'],
      ['ALTER TABLE users ALTER COLUMN display_name', 'SET NOT', 'NULL'],
      ['ALTER TABLE round_users ALTER COLUMN score', 'TYPE bigint'],
      ['alter table round_users alter column "score"', 'set data type bigint'],
      ['alter table round_users alter score type bigint'],
      ['alter table users alter column display_name set /* backfilled */ not null'],
      ['alter table round_users alter column score /* widened */ type bigint'],
    ])('passes %j with the marker as the first line of the tag', async (...lines) => {
      const result = await addMigration(NEW, tag(MARKER, ...lines))
      expect(result.code, result.output).toBe(0)
    })

    it('does not count the words of the marker as a statement', async () => {
      const result = await addMigration(
        NEW,
        tag('-- contract: drop obsolete column users.locale, unused since 0.3.0', 'alter table users drop column locale'),
      )
      expect(result.code, result.output).toBe(0)
    })

    it('fails a marker on its own line after the statement', async () => {
      const result = await addMigration(NEW, tag('alter table users drop column locale', MARKER))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement 'drop' with no leading marker`)
    })

    it('fails a marker that trails the statement on its line', async () => {
      const result = await addMigration(NEW, oneLine('alter table users drop column avatar_url -- contract: unused since 0.3.0'))
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement 'drop' with no leading marker`)
    })

    it('does not take a // comment for the marker', async () => {
      const result = await addMigration(
        NEW,
        migration('  // contract: removes users.locale\n  await sql`alter table users drop column locale`.execute(db)'),
      )
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement 'drop' with no leading marker`)
    })

    it('does not take a -- contract: inside a trailing // comment for the marker', async () => {
      const result = await addMigration(
        NEW,
        migration(
          '  await sql`select 1`.execute(db) // -- contract: removes users.locale\n  await sql`alter table users drop column locale`.execute(db)',
        ),
      )
      expect(result.code).toBe(1)
      expect(result.output).toContain(`contains the contract statement 'drop' with no leading marker`)
    })

    it.each([
      ['a // comment', migration('  // never drop a column here\n  await sql`alter table users add column locale text`.execute(db)')],
      ['a -- comment', tag('-- we will drop this later', 'alter table users add column locale text')],
      ['an identifier that contains a contract word', oneLine('alter table users add column dropdown_state text')],
      ['a // comment after code', migration('  await sql`alter table users add column locale text`.execute(db) // drop it in a later release')],
      ['a block comment', tag('/* we drop nothing here */', 'alter table users add column locale text')],
      ['a block comment over lines', tag('/*', ' * we will drop this later', ' */', 'alter table users add column locale text')],
      [
        'a // comment that mentions db.schema',
        migration('  // not db.schema.alterTable, see § Adding one\n  await sql`alter table users add column locale text`.execute(db)'),
      ],
    ])('ignores %s', async (_case, content) => {
      const result = await addMigration(NEW, content)
      expect(result.code, result.output).toBe(0)
    })
  })

  describe('schema builder', () => {
    it.each([
      ['on one line', migration("  await db.schema.alterTable('users').dropColumn('locale').execute()")],
      [
        'chained over lines',
        migration("  await db\n    .schema\n    .alterTable('users')\n    .alterColumn('display_name', c => c.setNotNull())\n    .execute()"),
      ],
      ['for an additive change', migration("  await db.schema.alterTable('users').addColumn('locale', 'text').execute()")],
    ])('fails a migration that uses it %s', async (_case, content) => {
      const result = await addMigration(NEW, content)
      expect(result.code).toBe(1)
      expect(result.output).toContain(`${migrationsDir}/${NEW} builds DDL with Kysely's schema builder (db.schema)`)
    })
  })
})
