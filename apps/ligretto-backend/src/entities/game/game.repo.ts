import { injectable, inject } from 'inversify'
import { Database } from '../../database'
import { Game } from '../../types/game'
import { TYPES } from '../../types'

@injectable()
export class GameRepository {
  @inject(TYPES.Database) private database: Database

  addGame(gameId: string, game: Game) {
    return this.database.set<Game>(storage => (storage.games[gameId] = game))
  }

  getGame(gameId: string) {
    return this.database.get(storage => storage.games[gameId])
  }

  async updateGame(gameId: string, updater: (game: Game) => Game) {
    const game = await this.getGame(gameId)
    return this.database.set(storage => (storage.games[gameId] = updater(game)))
  }

  removeGame(gameId: string) {
    return this.database.set(storage => delete storage.games[gameId])
  }

  filterGames(pattern: string): Promise<Game[]> {
    return this.database.get(storage =>
      Object.entries(storage.games)
        .filter(([gameId, game]) => game.name.includes(pattern) || gameId.includes(pattern))
        .map(([, game]) => game),
    )
  }
}
