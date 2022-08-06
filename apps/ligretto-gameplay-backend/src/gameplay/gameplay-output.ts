import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Database } from '../database'
import type { Game, UUID } from '@memebattle/ligretto-shared'

@injectable()
export class GameplayOutput {
  @inject(IOC_TYPES.Database) private database: Database

  public listenGame(gameId: UUID, callback: (game: Game) => void) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    this.database.addUpdateListener(`game-${gameId}`, storage => storage.games[gameId], callback)
  }

  public unlistenGame(gameId: UUID) {
    this.database.removeUpdateListener(`game-${gameId}`)
  }
}
