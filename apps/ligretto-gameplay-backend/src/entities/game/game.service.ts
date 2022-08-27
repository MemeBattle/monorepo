import { inject, injectable } from 'inversify'
import { groupBy, mapValues, merge, mergeWith, omit } from 'lodash'
import { GameRepository } from './game.repo'
import type { Game, GameResults, Player, Spectator, UUID } from '@memebattle/ligretto-shared'
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
  spectators: {},
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

  async createGame(name: string, config: Partial<Game['config']> = {}): Promise<Game | null> {
    const isGameExists = !!(await this.gameRepository.getGameByName(name))

    if (isGameExists) {
      return null
    }

    const game = await this.ligrettoCoreService.createGameService()

    return this.gameRepository.addGame(game.id, merge({}, emptyGame, { ...game, name, config: { ...emptyGame.config, ...config } }))
  }

  startGame(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => {
      const players: Game['players'] = {}
      const playersCount = Object.values(game.players).length

      /** 3 cards for 4 and more players. 4 cards for 3. 5 cards for 2 */
      const cardsInRowCount = playersCount >= 4 ? 3 : 3 + (4 - playersCount)

      for (const [playerId, player] of Object.entries(game.players as Record<UUID, Player>)) {
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

  async addSpectator(gameId: UUID, spectatorData: Partial<Spectator> & { id: Spectator['id'] }) {
    const spectator = await this.gameRepository.createSpectator(spectatorData)
    return {
      game: await this.gameRepository.updateGame(gameId, game => ({
        ...game,
        spectators: {
          ...game.spectators,
          [spectator.id]: { ...spectator, ...game.spectators[spectator.id] },
        },
      })),
      spectator,
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
    const { game, gameResults } = await this.finishRound(gameId)
    await this.gameRepository.removeGame(gameId)

    return [game, gameResults]
  }

  async finishRound(gameId: UUID): Promise<{ game?: Game; gameResults?: GameResults }> {
    const results = await this.getRoundResult(gameId)

    try {
      const { gameResults } = await this.ligrettoCoreService.saveGameRoundService(gameId, {
        results,
      })

      const game = await this.gameRepository.updateGame(gameId, game => ({
        ...game,
        status: GameStatus.RoundFinished,
        players: Object.values(game.players).reduce(
          (players, player) => (player ? { ...players, [player.id]: { ...player, status: PlayerStatus.DontReadyToPlay } } : players),
          {},
        ),
      }))

      return { game, gameResults }
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  findGames(pattern: string) {
    return this.gameRepository.getGames(pattern)
  }

  async leaveGame(gameId: UUID, userId: Player['id'] | Spectator['id']): Promise<Game | undefined> {
    let game = await this.gameRepository.updateGame(gameId, game => {
      const isHostLeaving = game.players[userId]?.isHost

      const players = omit(game.players, userId)
      const spectators = omit(game.spectators, userId)

      if (isHostLeaving) {
        const newHost = Object.values<Player>(players)[0]

        if (newHost) {
          newHost.isHost = true
        }
      }

      return {
        ...game,
        players,
        spectators,
      }
    })

    if (!game) {
      return
    }

    const playersCount = Object.keys(game.players).length
    if (playersCount === 0) {
      await this.gameRepository.removeGame(gameId)
      return
    }

    if (playersCount === 1) {
      game = await this.pauseGame(gameId)
    }

    return game
  }
}
