/**
 * The `is_temporary` → `account_type` backfill, run against the `users` table the old migration chain actually
 * leaves behind — the one shape this migration will ever meet in production.
 *
 * It lives here rather than beside the migration because Lucid's runner imports every script file in
 * `database/migrations/` and demands a migration class of it: a test file there would break every
 * `migration:run`, the functional suites' included.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import UsersAccountType from '../migrations/1792540800000_users_account_type.js'

const MIGRATION_FILE = 'database/migrations/1792540800000_users_account_type.ts'

/** `users` exactly as `1611429978856_users`, `1632587319270_users` and the timestamp rename leave it. */
const LEGACY_USERS = `create table users (
  created_at timestamptz,
  updated_at timestamptz,
  cas_id varchar(255) not null primary key,
  is_temporary boolean
)`

const pg = () => db.connection('pg')

const resetSchema = async () => {
  await pg().rawQuery('drop schema public cascade')
  await pg().rawQuery('create schema public')
}

const columnsOfUsers = async (): Promise<string[]> => {
  const result = await pg().rawQuery(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users'`)
  return (result as { rows: Array<{ column_name: string }> }).rows.map(row => row.column_name)
}

const runUp = async () => await new UsersAccountType(pg(), MIGRATION_FILE, false).execUp()

test.group('the users.account_type migration', group => {
  group.each.setup(async () => {
    await resetSchema()
    await pg().rawQuery(LEGACY_USERS)
    await pg().rawQuery(
      `insert into users (created_at, updated_at, cas_id, is_temporary) values
        (now(), now(), 'legacy-guest', true),
        (now(), now(), 'legacy-full', false),
        (now(), now(), 'legacy-never-set', null)`,
    )
  })

  // Whatever the file order of the suite, the next file finds the full schema.
  group.teardown(async () => {
    await resetSchema()
    await testUtils.db('pg').migrate()
  })

  test('only an explicit is_temporary becomes a guest', async ({ assert }) => {
    await runUp()

    const rows = await pg().from('users').select('cas_id', 'account_type').orderBy('cas_id')

    // A full user created through `firstOrCreate({ casId }, {})` left the column NULL, and was never a guest.
    assert.deepEqual(rows, [
      { cas_id: 'legacy-full', account_type: 'full' },
      { cas_id: 'legacy-guest', account_type: 'guest' },
      { cas_id: 'legacy-never-set', account_type: 'full' },
    ])
  })

  test('the old column goes and the snapshot columns arrive', async ({ assert }) => {
    await runUp()

    const columns = await columnsOfUsers()

    assert.notInclude(columns, 'is_temporary')
    assert.includeMembers(columns, ['cas_id', 'account_type', 'display_name', 'avatar_url'])
  })

  test('the primary keys are untouched', async ({ assert }) => {
    await runUp()

    const rows = await pg().from('users').select('cas_id').orderBy('cas_id')

    assert.deepEqual(rows, [{ cas_id: 'legacy-full' }, { cas_id: 'legacy-guest' }, { cas_id: 'legacy-never-set' }])
  })

  test('down restores is_temporary for exactly the guests', async ({ assert }) => {
    await runUp()
    await new UsersAccountType(pg(), MIGRATION_FILE, false).execDown()

    const rows = await pg().from('users').select('cas_id', 'is_temporary').orderBy('cas_id')

    // `false` rather than the NULL the row started with: nothing distinguishes a NULL from a `false` once the
    // column is gone, and `false` is what the value meant.
    assert.deepEqual(rows, [
      { cas_id: 'legacy-full', is_temporary: false },
      { cas_id: 'legacy-guest', is_temporary: true },
      { cas_id: 'legacy-never-set', is_temporary: false },
    ])

    const columns = await columnsOfUsers()
    assert.notInclude(columns, 'account_type')
    assert.notInclude(columns, 'display_name')
    assert.notInclude(columns, 'avatar_url')
  })
})
