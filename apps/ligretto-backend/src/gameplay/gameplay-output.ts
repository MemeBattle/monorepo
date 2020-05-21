import { inject, injectable } from 'inversify'
import { TYPES } from '../types'
import { Database } from '../database'
import { Game } from '@memebattle/ligretto-shared'

@injectable()
export class GameplayOutput {
  @inject(TYPES.Database) private database: Database

  public listenGame(gameId: string, callback: (game: Game) => void) {
    this.database.addUpdateListener(`game-${gameId}`, storage => storage.games[gameId], callback)
  }

  public unlistenGame(gameId: string) {
    this.database.removeUpdateListener(`game-${gameId}`)
  }
}
