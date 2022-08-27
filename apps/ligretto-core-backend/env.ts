/*
|--------------------------------------------------------------------------
| Validating Environment Variables
|--------------------------------------------------------------------------
|
| In this file we define the rules for validating environment variables.
| By performing validation we ensure that your application is running in
| a stable environment with correct configuration values.
|
| This file is read automatically by the framework during the boot lifecycle
| and hence do not rename or move this file to a different location.
|
*/

import Env from '@ioc:Adonis/Core/Env'
import dotenv from '@codexsoft/dotenv-flow'
import path from 'node:path'

dotenv.config({ default_node_env: 'development', path: path.resolve(__dirname, '../..') })

export default Env.rules({
  LIGRETTO_CORE_APP_KEY: Env.schema.string(),
  LIGRETTO_CORE_APP_NAME: Env.schema.string(),
  CAS_PARTNER_ID: Env.schema.string(),
  CAS_URL: Env.schema.string(),
  LIGRETTO_CORE_CAS_PUBLIC_KEY_PATH: Env.schema.string({ message: 'run init-partner script from cas-services to load key' }),
  LIGRETTO_CORE_DB_CONNECTION: Env.schema.enum(['pg'] as const),
  LIGRETTO_CORE_PG_HOST: Env.schema.string({ format: 'host' }),
  LIGRETTO_CORE_PG_PORT: Env.schema.number(),
  LIGRETTO_CORE_PG_USER: Env.schema.string(),
  LIGRETTO_CORE_PG_PASSWORD: Env.schema.string(),
  LIGRETTO_CORE_PG_DB_NAME: Env.schema.string(),

  LIGRETTO_CORE_APP_MODE: Env.schema.enum.optional(['migrations'] as const),
})
