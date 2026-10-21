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
import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../../../', import.meta.url), {
  LIGRETTO_CORE_APP_KEY: Env.schema.string(),
  LIGRETTO_CORE_APP_NAME: Env.schema.string(),

  /*
  | CAS, as `@memebattle/ligretto-auth` asks for it: the issuer, this application's confidential client, and the
  | two URIs CAS matches byte for byte against the client's registration. They are explicit configuration rather
  | than values derived from `LIGRETTO_CORE_URL`, because a derived callback drifts from the registered one
  | silently.
  */
  CAS_ISSUER: Env.schema.string(),
  LIGRETTO_CLIENT_ID: Env.schema.string(),
  LIGRETTO_CLIENT_SECRET: Env.schema.string(),
  LIGRETTO_CORE_AUTH_REDIRECT_URI: Env.schema.string(),
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: Env.schema.string(),
  /** Where the callback sends the browser once it is signed in, and where a logout with nothing to end goes. */
  LIGRETTO_CORE_AUTH_APP_URL: Env.schema.string(),
  /** How the session id travels. The production origin layout, and with it the final choice, is #818's. */
  LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: Env.schema.enum(['cookie', 'bearer'] as const),

  LIGRETTO_CORE_DB_CONNECTION: Env.schema.enum(['pg'] as const),
  LIGRETTO_CORE_PG_HOST: Env.schema.string({ format: 'host' }),
  LIGRETTO_CORE_PG_PORT: Env.schema.number(),
  LIGRETTO_CORE_PG_USER: Env.schema.string(),
  LIGRETTO_CORE_PG_PASSWORD: Env.schema.string(),
  LIGRETTO_CORE_PG_DB_NAME: Env.schema.string(),
})
