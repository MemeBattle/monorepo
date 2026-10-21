import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * The scheduled half of the session store: what a request path is never allowed to do. Run by the chart's
 * CronJob; safe to run twice over, since every row it takes is re-checked under that session's lock.
 *
 * Needs `@memebattle/ligretto-auth` built, since the sweep's retention window is that package's constant — which
 * is why the deployed CronJob runs the built app image. Locally: `pnpm --filter @memebattle/ligretto-auth build`
 * first. There is no source-mode alternative, `--conditions=development` least of all: it resolves the package to
 * `src/`, whose extensionless re-exports Node's own ESM resolver cannot follow. See AGENTS.md, "The sweep".
 */
export default class AuthSweep extends BaseCommand {
  public static commandName = 'auth:sweep'
  public static description = 'Remove expired authorization requests and sessions past the cookie grace window'

  public static options: CommandOptions = {
    startApp: true,
  }

  public async run() {
    // Imported here rather than at the top of the file: to list the commands, ace's filesystem loader imports
    // every module under `commands/`, and this one's graph reaches the built `@memebattle/ligretto-auth`. At the
    // top it would break bare `node ace` and `node ace list` in a checkout where nothing has been built yet.
    const { sweepExpiredAuth } = await import('#app/stores/sweepExpiredAuth')

    const db = await this.app.container.make('lucid.db')
    const counts = await sweepExpiredAuth({
      db,
      // Logged as they happen, with the id: the run carries on past them, so this is the only record of which
      // sessions it had to leave behind.
      onSessionFailure: (sessionId, failure) => {
        this.logger.warning(`Left session ${sessionId} for the next run: ${failure instanceof Error ? failure.message : String(failure)}`)
      },
    })

    this.logger.info(
      `Swept ${counts.authRequests} authorization request(s), ${counts.sessions} session(s) and ${counts.sessionLocks} orphaned lock(s)`,
    )
    if (counts.failedSessions > 0) {
      this.logger.warning(`${counts.failedSessions} session(s) could not be taken this run`)
    }
  }
}
