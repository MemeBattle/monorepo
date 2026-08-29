import { inject, injectable } from 'inversify'
import type { Game, Player, UUID, Spectator } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import type { Database } from '../../database'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class GameRepository {
  @inject(IOC_TYPES.Database) private database: Database

  addGame(gameId: UUID, game: Game) {
    return this.database.set<Game>(storage => (storage.games[gameId] = game))
  }

  getGame(gameId: UUID) {
    return this.database.get(storage => storage.games[gameId])
  }

  updateGame(gameId: UUID, updater: (game: Game) => Game): Game
  updateGame(gameId: UUID, updater: (game: Game) => Game | undefined): Game | undefined
  updateGame(gameId: UUID, updater: (game: Game) => Game | undefined): Game | undefined {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      if (!game) {
        return undefined
      }

      const updatedGame = updater(game)
      if (!updatedGame) {
        return undefined
      }

      return (storage.games[gameId] = updatedGame)
    })
  }

  markPlayerDisconnectedIfOffline(gameId: UUID, userId: UUID) {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      const user = storage.users[userId]
      const player = game?.players[userId]
      if (!game || !user || user.currentGameId !== gameId || user.socketIds.length > 0 || !player || player.status === PlayerStatus.Disconnected) {
        return undefined
      }

      const previousStatus = player.status
      const players = { ...game.players, [userId]: { ...player, status: PlayerStatus.Disconnected } }
      const onlineCount = Object.values(players).filter(current => current?.status !== PlayerStatus.Disconnected).length
      const updatedGame = {
        ...game,
        players,
        status: game.status === GameStatus.InGame && onlineCount < 2 ? GameStatus.Pause : game.status,
      }
      storage.games[gameId] = updatedGame
      return { game: updatedGame, previousStatus }
    })
  }

  setPlayerStatusIfEligible(gameId: UUID, userId: UUID, socketId: string, status: PlayerStatus) {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      const user = storage.users[userId]
      const player = game?.players[userId]
      if (
        !game ||
        game.status !== GameStatus.New ||
        !user ||
        user.currentGameId !== gameId ||
        !user.socketIds.includes(socketId) ||
        !player ||
        player.status === PlayerStatus.Disconnected ||
        (status !== PlayerStatus.ReadyToPlay && status !== PlayerStatus.DontReadyToPlay)
      ) {
        return undefined
      }
      return (storage.games[gameId] = { ...game, players: { ...game.players, [userId]: { ...player, status } } })
    })
  }

  getGameByName(gameName: string) {
    const games = this.database.get(storage => storage.games)
    const gamesByNames = this.getGamesByNames(games)
    return gamesByNames[gameName]
  }

  removeGame(gameId: UUID) {
    return this.database.set(storage => delete storage.games[gameId])
  }

  deleteIfAllParticipantsOffline(gameId: UUID) {
    return this.database.set(storage => {
      const game = storage.games[gameId]
      if (!game) {
        return undefined
      }

      const participantIds = [...new Set([...Object.keys(game.players), ...Object.keys(game.spectators)])]
      const hasOnlineParticipant = participantIds.some(userId => (storage.users[userId]?.socketIds.length ?? 0) > 0)
      const hasConnectedPlayer = Object.values(game.players).some(player => player?.status !== PlayerStatus.Disconnected)
      if (hasOnlineParticipant || hasConnectedPlayer) {
        return undefined
      }

      delete storage.games[gameId]
      for (const userId of participantIds) {
        const user = storage.users[userId]
        if (user?.currentGameId === gameId && user.socketIds.length === 0) {
          delete storage.users[userId]
        }
      }
      return game
    })
  }

  getGames(): Game[] {
    return this.database.get(storage => Object.values(storage.games)).filter(Boolean) as Game[]
  }

  getGamesByNames(games: Record<UUID, Game>): Record<string, UUID | undefined> {
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
