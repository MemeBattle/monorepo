import { inject, injectable } from 'inversify'
import type { Game, Player, UUID, Spectator } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class GameRepository {
  @inject(IOC_TYPES.Database) private database: Database

  async addGame(gameId: UUID, game: Game) {
    const isGameExist = await this.getGameByName(game.name)

    if (isGameExist) {
      return null
    }

    return this.database.set<Game>(storage => (storage.games[gameId] = game))
  }

  getGame(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId])
  }

  async updateGame(gameId: UUID, updater: (game: Game) => Game): Promise<Game> {
    const game = await this.getGame(gameId)

    return this.database.set(storage => (storage.games[gameId] = updater(game)))
  }

  async getGameByName(gameName: string) {
    const games = await this.database.get(storage => storage.games)
    const reverseMap = this.reverseMap(games)
    return reverseMap[gameName]
  }

  removeGame(gameId: UUID) {
    return this.database.set(storage => delete storage.games[gameId])
  }

  async getGames(pattern?: string): Promise<Game[]> {
    const games = (await this.database.get(storage => Object.values(storage.games))).filter(Boolean) as Game[]

    if (pattern) {
      return games.filter(game => game.name.includes(pattern) || game.id.includes(pattern))
    }

    return games
  }

  reverseMap(games: Record<UUID, Game>) {
    const result: Record<string, UUID | undefined> = {}

    Object.values(games).forEach(game => {
      result[game.name] = game.id
    })

    return result
  }

  createPlayer(playerData: Partial<Player> & { id: Player['id'] }): Player {
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

  createSpectator(playerData: Partial<Spectator> & { id: Spectator['id'] }): Spectator {
    return {
      ...playerData,
    }
  }
}
