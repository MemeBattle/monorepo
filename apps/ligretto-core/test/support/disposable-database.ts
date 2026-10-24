import pg from 'pg'

const DEFAULT_URL = 'postgres://ligretto-core-user:ligretto_pg_password@localhost:5435/ligretto-core-test'

/**
 * The database the destructive store tests may wipe: `LIGRETTO_CORE_TEST_DATABASE_URL`, or the compose service
 * `ligretto-core-pg-test` by default. Never `DATABASE_URL`, so an exported development or deployment URL cannot be
 * picked up, and only a database whose name ends in `-test`.
 */
export const disposableDatabaseUrl = (env: Record<string, string | undefined> = process.env): string => {
  const url = env.LIGRETTO_CORE_TEST_DATABASE_URL || DEFAULT_URL
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  if (!name.endsWith('-test')) {
    throw new Error(`refusing to run destructive tests against ${name || '(no database)'}: the database name must end in -test`)
  }
  return url
}

/** Drops everything in the `public` schema of the disposable database. */
export const resetDatabase = async (url: string): Promise<void> => {
  // The guard again: a caller cannot hand in a URL that skipped it.
  disposableDatabaseUrl({ LIGRETTO_CORE_TEST_DATABASE_URL: url })
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('drop schema public cascade')
    await client.query('create schema public')
  } finally {
    await client.end()
  }
}
