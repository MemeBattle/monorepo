import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { sweepExpiredAuth } from '#app/stores/sweepExpiredAuth'

/**
 * The scheduled half of the session store: what a request path is never allowed to do. Run by the chart's
 * CronJob; safe to run twice over, since every row it takes is re-checked under that session's lock.
 */
export default class AuthSweep extends BaseCommand {
  public static commandName = 'auth:sweep'
  public static description = 'Remove expired authorization requests and sessions past the cookie grace window'

  public static options: CommandOptions = {
    startApp: true,
  }

  public async run() {
    const db = await this.app.container.make('lucid.db')
    const counts = await sweepExpiredAuth({ db })

    this.logger.info(
      `Swept ${counts.authRequests} authorization request(s), ${counts.sessions} session(s) and ${counts.sessionLocks} orphaned lock(s)`,
    )
  }
}
