/**
 * Config source: https://git.io/JfefW
 *
 * Feel free to let us know via PR, if you find something broken in this config
 * file.
 */

import { defineConfig, drivers } from '@adonisjs/core/hash'

/*
|--------------------------------------------------------------------------
| Hash Config
|--------------------------------------------------------------------------
|
| The `HashConfig` relies on the `HashList` interface which is
| defined inside `contracts` directory.
|
*/
const hashConfig = defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Default hasher
  |--------------------------------------------------------------------------
  |
  | By default we make use of the scrypt hasher to hash values. However, feel
  | free to change the default value
  |
  */
  default: 'scrypt',

  list: {
    scrypt: drivers.scrypt({}),
  },
})

export default hashConfig
