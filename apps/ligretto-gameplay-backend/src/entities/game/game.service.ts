import { inject, injectable } from 'inversify'
import { groupBy, mapValues, merge, mergeWith, omit } from 'lodash'
import { GameRepository } from './game.repo'
import type { Game, GameResults, Player, UUID } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import { createInitialPlayerCards } from '../../utils/create-initial-player-cards'
import { IOC_TYPES } from '../../IOC_TYPES'
import { nonNullable } from '../../utils/nonNullable'
import { LigrettoCoreService } from '../../services/ligretto-core'

const emptyGame: Game = {
  id: 'base',
  status: GameStatus.New,
  name: 'BaseRoom',
  players: {},
  playground: {
    decks: [],
    droppedDecks: [],
  },
  config: { playersMaxCount: 4, dndEnabled: false },
}

@injectable()
export class GameService {
  @inject(IOC_TYPES.GameRepository) private gameRepository: GameRepository
  @inject(IOC_TYPES.LigrettoCoreService) private ligrettoCoreService: LigrettoCoreService

  async createGame(name: string, config: Partial<Game['config']> = {}) {
    const game = await this.ligrettoCoreService.createGameService()

    return this.gameRepository.addGame(game.id, merge({}, emptyGame, { ...game, name, config: { ...config, ...emptyGame.config } }))
  }

  startGame(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => {
      const players: Game['players'] = {}
      const playersCount = Object.values(game.players).length

      /** 3 cards for 4 and more players. 4 cards for 3. 5 cards for 2 */
      const cardsInRowCount = playersCount >= 4 ? 3 : 3 + (4 - playersCount)

      for (const [playerId, player] of Object.entries(game.players)) {
        const allCards = createInitialPlayerCards(playerId)

        if (!player) {
          continue
        }

        players[playerId] = {
          ...player,
          cards: allCards.splice(0, cardsInRowCount),
          ligrettoDeck: { cards: allCards.splice(0, 10), isHidden: true },
          stackOpenDeck: { cards: [], isHidden: false },
          stackDeck: {
            cards: allCards,
            isHidden: true,
          },
          status: PlayerStatus.InGame,
        }
      }

      return {
        ...game,
        status: GameStatus.InGame,
        players,
        playground: {
          decks: [],
          droppedDecks: [],
        },
      }
    })
  }

  pauseGame(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => ({ ...game, status: GameStatus.Pause }))
  }

  finishRound(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      status: GameStatus.RoundFinished,
      players: Object.values(game.players).reduce(
        (players, player) => (player ? { ...players, [player.id]: { ...player, status: PlayerStatus.DontReadyToPlay } } : players),
        {},
      ),
    }))
  }

  async addPlayer(gameId: UUID, playerData: Partial<Player> & { id: Player['id'] }) {
    const player = await this.gameRepository.createPlayer({ ...playerData })
    return {
      game: await this.gameRepository.updateGame(gameId, game => ({
        ...game,
        players: {
          ...game.players,
          [player.id]: { ...player, ...game.players[player.id], isHost: Object.keys(game.players).length === 0 },
        },
      })),
      player,
    }
  }

  async updateGamePlayer(gameId: Game['id'], playerId: Player['id'], playerData: Partial<Player>) {
    const game = await this.gameRepository.getGame(gameId)
    if (!game) {
      throw Error('Game not found')
    }

    const player = game.players[playerId]
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

  getGame(gameId: UUID) {
    return this.gameRepository.getGame(gameId)
  }

  async getRoundResult(gameId: UUID) {
    const game = await this.getGame(gameId)

    const initialScoresByPlayer = Object.keys(game.players).reduce<Record<string, 0>>((scores, playerId) => ({ ...scores, [playerId]: 0 }), {})

    const clearPlaygroundDecks = game.playground.decks.filter(nonNullable)

    const droppedCardsCount = [...clearPlaygroundDecks, ...game.playground.droppedDecks].reduce<Record<string, number>>((acc, deck) => {
      const groupedDeckCards = groupBy(deck.cards, card => card.playerId)
      return mergeWith(acc, groupedDeckCards, (playerScore, playerDroppedCards) => playerScore + playerDroppedCards.length)
    }, initialScoresByPlayer)

    const ligrettoStackCardsCount = Object.entries(game.players).reduce<Record<string, number>>(
      (counts, [playerId, player]) => ({
        ...counts,
        [playerId]: player?.ligrettoDeck.cards.length ?? 0,
      }),
      {},
    )

    return mapValues(
      mergeWith(ligrettoStackCardsCount, droppedCardsCount, (ligrettoCardsCount, droppedCardsCount) => droppedCardsCount - 2 * ligrettoCardsCount),
      roundScore => ({ roundScore }),
    )
  }

  async endGame(gameId: UUID) {
    const { game, gameResults } = await this.endRound(gameId)
    await this.gameRepository.removeGame(gameId)

    return [game, gameResults]
  }

  async endRound(gameId: UUID): Promise<{ game?: Game; gameResults?: GameResults }> {
    const results = await this.getRoundResult(gameId)

    try {
      const { gameResults } = await this.ligrettoCoreService.saveGameRoundService(gameId, {
        results,
      })

      console.log('endRound, results', gameResults)

      const game = await this.finishRound(gameId)

      return { game, gameResults }
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  findGames(pattern: string) {
    return this.gameRepository.getGames(pattern)
  }

  async leaveGame(gameId: UUID, playerId: Player['id']): Promise<Game | undefined> {
    let game = await this.gameRepository.updateGame(gameId, game => {
      const isHostLeaving = game.players[playerId]?.isHost

      const players = omit(game.players, playerId)

      if (isHostLeaving) {
        const newHost = Object.values<Player>(players)[0]

        if (newHost) {
          newHost.isHost = true
        }
      }

      return {
        ...game,
        players,
      }
    })
    console.log('New game state', game)

    if (!game) {
      return
    }

    const playersCount = Object.keys(game.players).length
    if (playersCount === 0) {
      await this.endGame(game.id)
      return
    }

    if (playersCount === 1) {
      game = await this.pauseGame(gameId)
    }

    return game
  }
}
