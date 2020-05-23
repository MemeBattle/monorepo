import { inject, injectable } from 'inversify'
import { GameRepository } from './game.repo'
import { Game, GameStatus, Player } from '@memebattle/ligretto-shared'
import { createInitialPlayerCards } from '../../utils/create-initial-player-cards'
import { TYPES } from '../../types'

const emptyGame: Game = {
  id: 'base',
  status: GameStatus.New,
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

      // eslint-disable-next-line guard-for-in
      for (const player in game.players) {
        const allCards = createInitialPlayerCards()
        console.log('allCards', allCards)

        players[player] = {
          ...game.players[player],
          cards: allCards.splice(0, 3),
          ligrettoDeck: { cards: allCards.splice(0, 10), isHidden: true },
          stackOpenDeck: { cards: [], isHidden: true },
          stackDeck: {
            cards: allCards,
            isHidden: false,
          },
        }
      }

      return {
        ...game,
        status: GameStatus.InGame,
        players,
        playground: { decks: [] },
      }
    })
  }

  async addPlayer(gameId: string, playerData: Partial<Player>) {
    const color = await this.gameRepository.getAvailableColor(gameId)
    const player = await this.gameRepository.createPlayer({ ...playerData, color })
    return {
      game: await this.gameRepository.updateGame(gameId, game => ({
        ...game,
        players: {
          ...game.players,
          [color]: player,
        },
      })),
      player,
    }
  }

  async updateGamePlayer(gameId: Game['id'], userId: Player['user'], playerData: Partial<Player>) {
    const game = await this.gameRepository.getGame(gameId)
    if (!game) {
      throw Error('Game not found')
    }

    const player = Object.values(game.players).find(player => player.user === userId)
    if (!player) {
      throw Error('Player not found in game')
    }

    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      players: {
        ...game.players,
        [player.color]: {
          ...player,
          ...playerData,
        },
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
    return this.gameRepository.getGames(pattern)
  }
}
