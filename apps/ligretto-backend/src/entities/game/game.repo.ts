import { inject, injectable } from 'inversify'
import type { Game, Player } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import type { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class GameRepository {
  @inject(IOC_TYPES.Database) private database: Database

  addGame(gameId: string, game: Game) {
    return this.database.set<Game>(storage => (storage.games[gameId] = game))
  }

  getGame(gameId: string) {
    return this.database.get(storage => storage.games[gameId])
  }

  async updateGame(gameId: string, updater: (game: Game) => Game): Promise<Game> {
    const game = await this.getGame(gameId)
    console.log('updateGame', game)
    if (!game) {
      return
    }
    return this.database.set<Game>(storage => (storage.games[gameId] = updater(game)))
  }

  removeGame(gameId: string) {
    return this.database.set(storage => delete storage.games[gameId])
  }

  getGames(pattern?: string): Promise<Game[]> {
    return pattern
      ? this.database.get(storage =>
          Object.entries(storage.games)
            .filter(([gameId, game]) => game.name.includes(pattern) || gameId.includes(pattern))
            .map(([, game]) => game),
        )
      : this.database.get(storage => Object.values(storage.games))
  }

  createPlayer(playerData: Partial<Player>): Player {
    return {
      id: 'empty',
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
}
