import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import type { Config } from '@japa/runner/types'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 *
 * Note: pluginAdonisJS@5.x requires @adonisjs/core v7 internals not
 * present in v6. It is excluded here to avoid the crash when
 * @japa/api-client is installed. apiClient is registered manually
 * pointing at the default test server URL.
 */
export const plugins: Config['plugins'] = [assert(), apiClient('http://127.0.0.1:3333')]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [],
  teardown: [],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = suite => {
  if (['functional'].includes(suite.name)) {
    suite.setup(() => testUtils.httpServer().start())
    suite.setup(() => testUtils.db().migrate())
    suite.teardown(() => testUtils.db().truncate())
  }
}
