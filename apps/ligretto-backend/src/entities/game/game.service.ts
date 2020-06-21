import { inject, injectable } from 'inversify'
import { omit } from 'lodash'
import { GameRepository } from './game.repo'
import { CardColors, Game, GameStatus, Player } from '@memebattle/ligretto-shared'
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

        players[player] = {
          ...game.players[player],
          cards: allCards.splice(0, 3),
          ligrettoDeck: { cards: allCards.splice(0, 10), isHidden: true },
          stackOpenDeck: { cards: [], isHidden: false },
          stackDeck: {
            cards: allCards,
            isHidden: true,
          },
        }
      }

      return {
        ...game,
        status: GameStatus.InGame,
        players,
        playground: {
          decks: [
            { isHidden: false, cards: [{ value: 9, color: CardColors.yellow }] },
            {
              isHidden: false,
              cards: [{ value: 9, color: CardColors.red }],
            },
            { isHidden: false, cards: [{ value: 9, color: CardColors.green }] },
          ],
        },
      }
    })
  }

  pauseGame(gameId: string) {
    return this.gameRepository.updateGame(gameId, game => ({ ...game, status: GameStatus.Pause }))
  }

  async addPlayer(gameId: string, playerData: Partial<Player> & { id: Player['id'] }) {
    const player = await this.gameRepository.createPlayer({ ...playerData })
    return {
      game: await this.gameRepository.updateGame(gameId, game => ({
        ...game,
        players: {
          ...game.players,
          [player.id]: player,
        },
      })),
      player,
    }
  }

  async updateGamePlayer(gameId: Game['id'], socketId: Player['id'], playerData: Partial<Player>) {
    const game = await this.gameRepository.getGame(gameId)
    if (!game) {
      throw Error('Game not found')
    }

    const player = game.players[socketId]
    if (!player) {
      throw Error('Player not found in game')
    }

    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      players: {
        ...game.players,
        [player.id]: {
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

  async leaveGame(gameId: string, playerId: Player['id']): Promise<Game | null> {
    const game = await this.gameRepository.updateGame(gameId, game => {
      const isHostLeaving = game.players[playerId].isHost
      return {
        ...game,
        players: Object.entries(omit(game.players, playerId)).reduce(
          (players, [playerId, player], index): Game['players'] => ({
            ...players,
            [playerId]: { ...player, isHost: isHostLeaving && index === 0 ? true : player.isHost },
          }),
          {},
        ),
      }
    })
    console.log('New game state', game)
    if (!game) {
      return
    }
    const playersCount = Object.keys(game.players).length
    if (playersCount === 0) {
      await this.endGame(game.id)
      return null
    }
    if (playersCount === 1) {
      await this.pauseGame(gameId)
    }
    return game
  }
}
