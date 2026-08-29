import { inject, injectable } from 'inversify'
import { groupBy, mapValues, merge, mergeWith, omit } from 'lodash'
import type { GameRepository } from './game.repo'
import type { Game, GameResults, Player, Spectator, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus, GameStatus } from '@memebattle/ligretto-shared'
import { createInitialPlayerCards } from '../../utils/create-initial-player-cards'
import { IOC_TYPES } from '../../IOC_TYPES'
import { nonNullable } from '../../utils/nonNullable'
import type { LigrettoCoreService } from '../../services/ligretto-core'

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
  config: { playersMaxCount: 4, startingDelayInSec: 4, dndEnabled: false, maxCardsOnTable: 12 },
}

@injectable()
export class GameService {
  @inject(IOC_TYPES.GameRepository) private gameRepository: GameRepository
  @inject(IOC_TYPES.LigrettoCoreService) private ligrettoCoreService: LigrettoCoreService

  async createGame(name: string, config: Partial<Game['config']> = {}): Promise<Game | null> {
    if (this.gameRepository.getGameByName(name)) {
      return null
    }

    const game = await this.ligrettoCoreService.createGameService()

    // Re-check after the HTTP call: a concurrent createGame with the same name
    // may have finished while we were waiting for the core backend.
    if (this.gameRepository.getGameByName(name)) {
      return null
    }

    return this.gameRepository.addGame(game.id, merge({}, emptyGame, { ...game, name, config: { ...emptyGame.config, ...config } }))
  }

  initiateStartGame(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      status: GameStatus.Starting,
    }))
  }

  startGame(gameId: UUID) {
    this.gameRepository.clearRoundResults(gameId)
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
          // A disconnected player keeps their status through the deal, so the
          // lifecycle (handover, deletion, reconnect restore) still sees them
          // as offline; they get a hand to play with if they return mid-round.
          status: player.status === PlayerStatus.Disconnected ? PlayerStatus.Disconnected : PlayerStatus.InGame,
        }
      }

      return {
        ...game,
        status: GameStatus.InGame,
        players,
        playground: {
          decks: new Array(game.config.maxCardsOnTable).fill(null),
          droppedDecks: [],
        },
      }
    })
  }

  pauseGame(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => ({ ...game, status: GameStatus.Pause }))
  }

  resumeGame(gameId: UUID, userId: Player['id']) {
    return this.gameRepository.updateGame(gameId, game => {
      const onlinePlayers = Object.values(game.players).filter(player => player?.status !== PlayerStatus.Disconnected)
      if (game.status !== GameStatus.Pause || !game.players[userId]?.isHost || onlinePlayers.length < 2) {
        return undefined
      }

      return { ...game, status: GameStatus.InGame }
    })
  }

  markPlayerDisconnectedIfOffline(gameId: UUID, userId: Player['id']) {
    return this.gameRepository.markPlayerDisconnectedIfOffline(gameId, userId)
  }

  setPlayerStatusIfEligible(gameId: UUID, userId: Player['id'], socketId: string, status: PlayerStatus) {
    return this.gameRepository.setPlayerStatusIfEligible(gameId, userId, socketId, status)
  }

  markPlayerConnected(gameId: UUID, userId: Player['id'], status: Exclude<PlayerStatus, PlayerStatus.Disconnected>) {
    return this.gameRepository.updateGame(gameId, game => {
      const player = game.players[userId]
      if (!player || player.status !== PlayerStatus.Disconnected) {
        return game
      }
      return { ...game, players: { ...game.players, [userId]: { ...player, status } } }
    })
  }

  transferDisconnectedHost(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => {
      const currentHost = Object.values(game.players).find(player => player?.isHost)
      if (!currentHost || currentHost.status !== PlayerStatus.Disconnected) {
        return undefined
      }
      const replacement = Object.values(game.players)
        .filter((player): player is Player => !!player && player.status !== PlayerStatus.Disconnected)
        .sort((left, right) => left.id.localeCompare(right.id))[0]
      if (!replacement) {
        return undefined
      }
      return {
        ...game,
        players: Object.fromEntries(Object.entries(game.players).map(([id, player]) => [id, player && { ...player, isHost: id === replacement.id }])),
      }
    })
  }

  deleteIfAllOffline(gameId: UUID) {
    return this.gameRepository.deleteIfAllParticipantsOffline(gameId)
  }

  removeSpectatorIfOffline(gameId: UUID, userId: Spectator['id']) {
    return this.gameRepository.removeSpectatorIfOffline(gameId, userId)
  }

  getLastRoundResults(gameId: UUID) {
    return this.gameRepository.getRoundResults(gameId)
  }

  addPlayer(gameId: UUID, playerData: Partial<Player> & { id: Player['id'] }) {
    const player = this.gameRepository.createPlayer({ ...playerData })
    return {
      game: this.gameRepository.updateGame(gameId, game => ({
        ...game,
        players: {
          ...game.players,
          [player.id]: { ...player, ...game.players[player.id], isHost: Object.keys(game.players).length === 0 },
        },
      })),
      player,
    }
  }

  addSpectator(gameId: UUID, spectatorData: Partial<Spectator> & { id: Spectator['id'] }) {
    const spectator = this.gameRepository.createSpectator(spectatorData)
    return {
      game: this.gameRepository.updateGame(gameId, game => ({
        ...game,
        spectators: {
          ...game.spectators,
          [spectator.id]: { ...spectator, ...game.spectators[spectator.id] },
        },
      })),
      spectator,
    }
  }

  getGame(gameId: UUID) {
    return this.gameRepository.getGame(gameId)
  }

  getRoundResult(gameId: UUID) {
    const game = this.getGame(gameId)

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
    this.gameRepository.removeGame(gameId)

    return [game, gameResults]
  }

  async finishRound(gameId: UUID): Promise<{ game?: Game; gameResults?: GameResults }> {
    // Atomically claim the round finish: the status transition and the results
    // snapshot happen synchronously, so concurrent callers bail out here and
    // the round cannot be saved twice.
    let previousStatus: GameStatus | undefined
    const claimed = this.gameRepository.updateGame(gameId, game => {
      if (game.status === GameStatus.RoundFinished) {
        return undefined
      }
      previousStatus = game.status
      return { ...game, status: GameStatus.RoundFinished }
    })
    if (!claimed) {
      return {}
    }

    const results = this.getRoundResult(gameId)

    try {
      const { gameResults } = await this.ligrettoCoreService.saveGameRoundService(gameId, {
        results,
      })

      const game = this.gameRepository.updateGame(gameId, game => ({
        ...game,
        players: Object.values(game.players).reduce(
          (players, player) =>
            player
              ? {
                  ...players,
                  [player.id]: {
                    ...player,
                    // The lifecycle owns the Disconnected flag: erasing it here
                    // would resurrect an offline player as a permanent ghost.
                    status: player.status === PlayerStatus.Disconnected ? PlayerStatus.Disconnected : PlayerStatus.DontReadyToPlay,
                  },
                }
              : players,
          {},
        ),
        // The round is over, so its cards must not linger on the table
        // through the intermission and the next round's starting countdown.
        playground: {
          decks: new Array(game.config.maxCardsOnTable).fill(null),
          droppedDecks: [],
        },
      }))

      if (gameResults) {
        this.gameRepository.setRoundResults(gameId, gameResults)
      }
      return { game, gameResults }
    } catch (e) {
      console.error(e)
      // Release the claim so the round can be finished again after a failed save.
      this.gameRepository.updateGame(gameId, game => ({ ...game, status: previousStatus ?? game.status }))
      throw e
    }
  }

  getGames() {
    return this.gameRepository.getGames()
  }

  leaveGame(gameId: UUID, userId: Player['id'] | Spectator['id']): Game | undefined {
    let game = this.gameRepository.updateGame(gameId, game => {
      const isHostLeaving = game.players[userId]?.isHost

      const players = omit(game.players, userId)
      const spectators = omit(game.spectators, userId)

      if (isHostLeaving) {
        // Prefer an online successor: a Disconnected host cannot start or
        // resume anything, and no handover timer is armed for this promotion.
        const remaining = Object.values<Player>(players)
        const newHost = remaining.find(player => player.status !== PlayerStatus.Disconnected) ?? remaining[0]

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
      this.gameRepository.removeGame(gameId)
      return
    }

    // An explicit leave that drops a running (or paused) round below two
    // online players abandons the round: pausing instead would be terminal,
    // because newcomers join a paused game as spectators, so the online count
    // could never reach two again. RoundFinished lets the room refill and the
    // host start a fresh round. The New lobby and the intermission stay as
    // they are.
    const onlineCount = Object.values(game.players).filter(player => player?.status !== PlayerStatus.Disconnected).length
    if ((game.status === GameStatus.InGame || game.status === GameStatus.Pause) && onlineCount < 2) {
      game = this.abandonRound(gameId)
    }

    return game
  }

  private abandonRound(gameId: UUID) {
    return this.gameRepository.updateGame(gameId, game => ({
      ...game,
      status: GameStatus.RoundFinished,
      players: Object.values(game.players).reduce(
        (players, player) =>
          player
            ? {
                ...players,
                [player.id]: {
                  ...player,
                  status: player.status === PlayerStatus.Disconnected ? PlayerStatus.Disconnected : PlayerStatus.DontReadyToPlay,
                },
              }
            : players,
        {},
      ),
      playground: {
        decks: new Array(game.config.maxCardsOnTable).fill(null),
        droppedDecks: [],
      },
    }))
  }
}
