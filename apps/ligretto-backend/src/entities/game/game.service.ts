import { inject, injectable } from 'inversify'
import { GameRepository } from './game.repo'
import { Game, Player } from '@memebattle/ligretto-shared'
import { TYPES } from '../../types'

const emptyGame: Game = {
  id: 'base',
  name: 'BaseRoom',
  players: {},
  playground: {
    decks: [],
  },
  config: { cardsCount: 3, playersMaxCount: 4 },
}

@injectable()
export class GameService {
  @inject(TYPES.GameRepository) private gameRepository: GameRepository

  createGame(name: string) {
    const gameId = String(Math.random()).slice(5)
    return this.gameRepository.addGame(gameId, { ...emptyGame, name, id: gameId })
  }

  startGame(gameId: string) {
    return this.gameRepository.updateGame(gameId, game => {
      const players: Game['players'] = {}
      // eslint-disable-next-line
      for (const player in game.players) {
        players[player] = {
          ...game.players[player],
          cards: [
            /* Карты */
          ],
          stackDeck: {
            cards: [
              /* Колода */
            ],
            isHidden: false,
          },
          stackOpenDeck: { cards: [], isHidden: false },
        }
      }

      return {
        ...game,
        players,
        playground: { decks: [] },
      }
    })
  }

  async addPlayer(gameId: string, player: Player) {
    const color = await this.gameRepository.getAvailableColor(gameId)
    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      players: {
        ...game.players,
        [color]: player,
      },
    }))
  }

  getGame(gameId: string) {
    return this.gameRepository.getGame(gameId)
  }

  getResult(gameId: string) {}

  async endGame(gameId: string) {
    const result = this.getResult(gameId)
    await this.gameRepository.removeGame(gameId)
    return result
  }

  findGames(pattern: string) {
    return this.gameRepository.filterGames(pattern)
  }
}
