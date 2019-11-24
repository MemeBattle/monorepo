import { injectable, inject } from 'inversify'
import { Database } from '../../database'
import { Game } from '../../types/game'
import { TYPES } from '../../types'

@injectable()
export class GameRepository {
  @inject(TYPES.Database) private database: Database

  async addGame(gameId: string, game: Game) {
    return this.database.set(storage => (storage.games[gameId] = game))
  }

  async getGame(gameId: string) {
    return this.database.get(storage => storage.games[gameId])
  }

  async updateGame(gameId: string, updater: (game: Game) => Game) {
    const game = await this.getGame(gameId)
    return this.database.set(storage => (storage.games[gameId] = updater(game)))
  }

  async removeGame(gameId: string) {
    return this.database.set(storage => delete storage.games[gameId])
  }
}
