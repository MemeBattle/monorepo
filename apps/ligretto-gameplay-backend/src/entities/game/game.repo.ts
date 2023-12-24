import { inject, injectable } from 'inversify'
import type { Game, Player, UUID, Spectator } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { IDatabase } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

export interface IGameRepository {
  addGame(gameId: UUID, game: Game): Promise<Game>
  getGame(gameId: UUID): Promise<Game>
  updateGame(gameId: UUID, updater: (game: Game) => Game): Promise<Game>
  getGameByName(gameName: string): Promise<string | undefined>
  removeGame(gameId: UUID): Promise<boolean>
  getGames(): Promise<Game[]>
  getGamesByNames(games: Record<UUID, Game>): Record<string, UUID | undefined>
  createPlayer(playerData: Partial<Player> & { id: Player['id'] }): Player
  createSpectator(playerData: Partial<Spectator> & { id: Spectator['id'] }): Spectator
}
@injectable()
export class GameRepository implements IGameRepository {
  @inject(IOC_TYPES.IDatabase) private database: IDatabase

  async addGame(gameId: UUID, game: Game) {
    return this.database.set<Game>(storage => (storage.games[gameId] = game))
  }

  getGame(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId])
  }

  async updateGame(gameId: UUID, updater: (game: Game) => Game) {
    const game = await this.getGame(gameId)

    return this.database.set(storage => (storage.games[gameId] = updater(game)))
  }

  async getGameByName(gameName: string) {
    const games = await this.database.get(storage => storage.games)
    const gamesByNames = this.getGamesByNames(games)
    return gamesByNames[gameName]
  }

  removeGame(gameId: UUID) {
    return this.database.set(storage => delete storage.games[gameId])
  }

  async getGames() {
    const games = (await this.database.get(storage => Object.values(storage.games))).filter(Boolean) as Game[]
    return games
  }

  getGamesByNames(games: Record<UUID, Game>) {
    const result: Record<string, UUID | undefined> = {}

    Object.values(games).forEach(game => {
      result[game.name] = game.id
    })

    return result
  }

  createPlayer(playerData: Partial<Player> & { id: Player['id'] }) {
    return {
      isHost: false,
      status: PlayerStatus.DontReadyToPlay,
      stackDeck: {
        isHidden: true,
        cards: [],
      },
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: {
        isHidden: true,
        cards: [],
      },
      ...playerData,
    }
  }

  createSpectator(playerData: Partial<Spectator> & { id: Spectator['id'] }) {
    return {
      ...playerData,
    }
  }
}
