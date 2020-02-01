import { inject, injectable } from 'inversify'
import { TYPES } from '../types'
import { Database } from '../database'

@injectable()
export class GameplayOutput {
  @inject(TYPES.Database) private database: Database

  public listenGame(gameId: string) {
    this.database.addUpdateListener(
      'gameplay-output',
      storage => storage.games[gameId],
      changes => {
        console.log('changes', changes)
      },
    )
  }
}
