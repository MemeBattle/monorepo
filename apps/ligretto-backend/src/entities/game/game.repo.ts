import { injectable, inject } from 'inversify'
import { Game, CardColors } from '@memebattle/ligretto-shared'
import { without } from 'lodash'
import { Database } from '../../database'
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

  async updateGame(gameId: string, updater: (game: Game) => Game): Promise<Game> {
    const game = await this.getGame(gameId)
    return this.database.set<Game>(storage => (storage.games[gameId] = updater(game)))
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

  async getAvailableColor(gameId: string): Promise<CardColors | null> {
    const notAvailableColors = await this.database.get(storage => Object.values(storage.games[gameId].players).map(player => player.color))
    return without(Object.values(CardColors), ...notAvailableColors)[0] ?? null
  }
}
