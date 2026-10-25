import { describe, expect, it } from 'vitest'

import { disposableDatabaseUrl } from './disposable-database'

const at = (database: string) => `postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/${database}`

describe('disposableDatabaseUrl', () => {
  it('defaults to the ligretto-core-pg-test compose service', () => {
    expect(disposableDatabaseUrl({})).toBe('postgres://ligretto-core-user:ligretto_pg_password@localhost:5435/ligretto-core-test')
  })

  it('accepts a database whose name ends in -test', () => {
    expect(disposableDatabaseUrl({ LIGRETTO_CORE_TEST_DATABASE_URL: at('scratch-test') })).toBe(at('scratch-test'))
  })

  it.each(['ligretto-core', 'ligretto-core-hono', ''])('refuses the database %j', database => {
    expect(() => disposableDatabaseUrl({ LIGRETTO_CORE_TEST_DATABASE_URL: at(database) })).toThrow(/refusing to run destructive tests/)
  })

  it.each(['socket:/tmp/pg-test?db=ligretto-core', 'pg://localhost/ligretto-core-test'])(
    'refuses the URL %j, whose scheme pg reads differently',
    url => {
      expect(() => disposableDatabaseUrl({ LIGRETTO_CORE_TEST_DATABASE_URL: url })).toThrow(/refusing to run destructive tests/)
    },
  )

  it('accepts the postgresql: scheme', () => {
    const url = 'postgresql://localhost:5435/ligretto-core-test'
    expect(disposableDatabaseUrl({ LIGRETTO_CORE_TEST_DATABASE_URL: url })).toBe(url)
  })

  it('ignores DATABASE_URL', () => {
    expect(disposableDatabaseUrl({ DATABASE_URL: at('ligretto-core') })).toBe(
      'postgres://ligretto-core-user:ligretto_pg_password@localhost:5435/ligretto-core-test',
    )
    expect(disposableDatabaseUrl({ DATABASE_URL: at('elsewhere-test') })).not.toContain('elsewhere-test')
  })
})
