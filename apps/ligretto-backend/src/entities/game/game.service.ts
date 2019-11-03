import { inject, injectable } from 'inversify'
import { GameRepository } from './game.repo'
import { Game } from '../../types/game'
import { Player } from '../../types/player'

const emptyGame: Game = {
  players: {},
  playground: {
    decks: [],
  },
  config: { cardsCount: 3 },
}

@injectable()
export class GameService {
  constructor(
    @inject(GameRepository) private gameRepository: GameRepository,
  ) {}

  async createGame(gameId: string) {
    return this.gameRepository.addGame(gameId, emptyGame)
  }

  async startGame(gameId: string) {
    return this.gameRepository.updateGame(gameId, (game => {
      const players: Game['players'] = {}
      for (const player in game.players) {
        players[player] = {
          ...game.players[player],
          cards: [/* Карты */],
          stackDeck: { cards: [/* Колода */], isHidden: false },
          stackOpenDeck: { cards: [], isHidden: false },
        }
      }

      return {
        ...game,
        players,
        playground: { decks: [] },
      }
    }))
  }

  async addPlayer(gameId: string, player: Player) {
    return this.gameRepository.updateGame(gameId, (game) => {
      return {
        ...game,
        players: {
          ...game.players,
          [player.color]: player,
        }
      }
    })
  }

  async getGame(gameId: string) {
    await this.gameRepository.getGame(gameId);
  }

  async getResult(gameId: string) {}

  async endGame(gameId: string) {
    const result = this.getResult(gameId);
    await this.gameRepository.removeGame(gameId)
    return result;
  }
}
