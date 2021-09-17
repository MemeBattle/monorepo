import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Database } from '../database'
import type { Game } from '@memebattle/ligretto-shared'

@injectable()
export class GameplayOutput {
  @inject(IOC_TYPES.Database) private database: Database

  public listenGame(gameId: string, callback: (game: Game) => void) {
    this.database.addUpdateListener(`game-${gameId}`, storage => storage.games[gameId], callback)
  }

  public unlistenGame(gameId: string) {
    this.database.removeUpdateListener(`game-${gameId}`)
  }
}
