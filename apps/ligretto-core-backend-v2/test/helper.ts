import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { buildServer } from '@platformatic/db'

const { createConnectionPool } = require('@platformatic/sql-mapper')
const connectionString = 'postgres://ligretto-core-user:ligretto_pg_password@127.0.0.1:5433/ligretto-core'
let counter = 0


export async function getServer (t) {

  const { db, sql } = await createConnectionPool({
    log: {
      debug: () => {},
      info: () => {},
      trace: () => {}
    },
    connectionString,
    poolSize: 1
  })

  const newDB = `t-${process.pid}-${counter++}`
  t.diagnostic('Creating database ' + newDB)

  await db.query(sql`
    CREATE DATABASE ${sql.ident(newDB)}
  `)

  // We go up two folder because this files executes in the dist folder
  const config = JSON.parse(await readFile(join(__dirname, '..', '..', 'platformatic.db.json'), 'utf8'))
  // Add your config customizations here. For example you want to set
  // all things that are set in the config file to read from an env variable
  config.server.logger.level = 'warn'
  config.watch = false

  config.migrations.autoApply = true
  config.types.autogenerate = false
  config.db.connectionString = connectionString.replace(/\/[a-zA-Z0-9\-_]+$/, '/' + newDB)
  config.db.schemalock = false

  // Add your config customizations here
  const server = await buildServer(config)
  t.after(() => server.close())

  t.after(async () => {
    t.diagnostic('Disposing test database ' + newDB)
    await db.query(sql`
      DROP DATABASE ${sql.ident(newDB)}
    `)
    await db.dispose()
  })

  return server
}
  