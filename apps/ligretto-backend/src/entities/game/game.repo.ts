/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { injectable } from 'inversify'
import { database } from '../../database/database'
import { Game } from '../../types/game'

@injectable()
export class GameRepository {
  async addGame(gameId: string, game: Game) {
    return database.set(storage => storage.games[gameId] = game)
  }

  async getGame(gameId: string) {
    return database.get(storage => storage.games[gameId]);
  }

  async updateGame(gameId: string, updater: (game: Game) => Game) {
    const game = await this.getGame(gameId);
    return database.set(storage => storage.games[gameId] = updater(game));
  }

  async removeGame(gameId: string) {
    return database.set(storage => delete storage.games[gameId]);
  }
}
