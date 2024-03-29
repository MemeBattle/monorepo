/**
 * Config source: https://git.io/JesV9
 *
 * Feel free to let us know via PR, if you find something broken in this config
 * file.
 */

import Env from '@ioc:Adonis/Core/Env'
import type { DatabaseConfig } from '@ioc:Adonis/Lucid/Database'

const databaseConfig: DatabaseConfig = {
  /*
  |--------------------------------------------------------------------------
  | Connection
  |--------------------------------------------------------------------------
  |
  | The primary connection for making database queries across the application
  | You can use any key from the `connections` object defined in this same
  | file.
  |
  */
  connection: Env.get('LIGRETTO_CORE_DB_CONNECTION'),

  connections: {
    /*
    |--------------------------------------------------------------------------
    | PostgreSQL config
    |--------------------------------------------------------------------------
    |
    | Configuration for PostgreSQL database. Make sure to install the driver
    | from npm when using this connection
    |
    | npm i pg
    |
    */
    pg: {
      client: 'pg',
      connection: {
        host: Env.get('LIGRETTO_CORE_PG_HOST'),
        port: Env.get('LIGRETTO_CORE_PG_PORT'),
        user: Env.get('LIGRETTO_CORE_PG_USER'),
        password: Env.get('LIGRETTO_CORE_PG_PASSWORD', ''),
        database: Env.get('LIGRETTO_CORE_PG_DB_NAME'),
      },
      migrations: {
        naturalSort: true,
      },
      pool: {
        min: 0,
        max: 5,
        acquireTimeoutMillis: 60000,
        idleTimeoutMillis: 600000,
      },
      healthCheck: true,
      debug: false,
    },
  },
}

export default databaseConfig
