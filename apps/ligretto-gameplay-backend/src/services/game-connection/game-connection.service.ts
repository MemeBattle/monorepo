import type { Game, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { inject, injectable } from 'inversify'

import { ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS, DISCONNECT_GRACE_PERIOD_MS, HOST_HANDOVER_TIMEOUT_MS } from '../../config'
import type { GameService } from '../../entities/game/game.service'
import type { UserService } from '../../entities/user'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { GameOperationSerializer } from '../game-operation-serializer'

type LifecycleEvents = { onUpdate: (game: Game) => void; onDelete: (gameId: UUID) => void }

@injectable()
export class GameConnectionService {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService
  @inject(IOC_TYPES.GameOperationSerializer) private gameOperations: GameOperationSerializer

  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private hostTimers = new Map<UUID, ReturnType<typeof setTimeout>>()
  private deletionTimers = new Map<UUID, ReturnType<typeof setTimeout>>()
  private hostDeadlines = new Map<UUID, number>()
  private disconnectedStatuses = new Map<string, Exclude<PlayerStatus, PlayerStatus.Disconnected>>()

  private key(gameId: UUID, userId: UUID) {
    return `${gameId}:${userId}`
  }

  transportDisconnected(gameId: UUID, userId: UUID, events: LifecycleEvents) {
    const key = this.key(gameId, userId)
    clearTimeout(this.graceTimers.get(key))
    const timer = setTimeout(() => void this.expireGrace(gameId, userId, events, timer), DISCONNECT_GRACE_PERIOD_MS)
    this.graceTimers.set(key, timer)
  }

  private async expireGrace(gameId: UUID, userId: UUID, events: LifecycleEvents, timer: ReturnType<typeof setTimeout>) {
    const key = this.key(gameId, userId)
    if (this.graceTimers.get(key) !== timer) {
      return
    }
    this.graceTimers.delete(key)
    await this.gameOperations.run(gameId, async () => {
      const transition = await this.gameService.markPlayerDisconnectedIfOffline(gameId, userId)
      if (!transition) {
        const currentGame = await this.gameService.getGame(gameId)
        if (
          currentGame?.spectators[userId] &&
          !(await this.userService.hasLiveSockets(userId)) &&
          Object.values(currentGame.players).every(player => player?.status === PlayerStatus.Disconnected)
        ) {
          this.scheduleDeletion(gameId, events)
        }
        return
      }
      const { game, previousStatus } = transition
      this.disconnectedStatuses.set(this.key(gameId, userId), previousStatus)
      events.onUpdate(game)

      if (game.players[userId]?.isHost) {
        this.scheduleHostHandover(gameId, events)
      }
      if (Object.values(game.players).every(player => player?.status === PlayerStatus.Disconnected)) {
        this.scheduleDeletion(gameId, events)
      }
    })
  }

  private scheduleHostHandover(gameId: UUID, events: LifecycleEvents) {
    clearTimeout(this.hostTimers.get(gameId))
    this.hostDeadlines.set(gameId, Date.now() + HOST_HANDOVER_TIMEOUT_MS)
    this.hostTimers.set(
      gameId,
      setTimeout(async () => {
        this.hostTimers.delete(gameId)
        const game = await this.gameOperations.run(gameId, () => this.gameService.transferDisconnectedHost(gameId))
        if (game) {
          this.hostDeadlines.delete(gameId)
          events.onUpdate(game)
        }
      }, HOST_HANDOVER_TIMEOUT_MS),
    )
  }

  private scheduleDeletion(gameId: UUID, events: LifecycleEvents) {
    clearTimeout(this.deletionTimers.get(gameId))
    this.deletionTimers.set(
      gameId,
      setTimeout(async () => {
        this.deletionTimers.delete(gameId)
        const game = await this.gameOperations.run(gameId, () => this.gameService.deleteIfAllOffline(gameId))
        if (!game) {
          return
        }
        for (const key of this.disconnectedStatuses.keys()) {
          if (key.startsWith(`${gameId}:`)) {
            this.disconnectedStatuses.delete(key)
          }
        }
        this.hostDeadlines.delete(gameId)
        events.onDelete(gameId)
      }, ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS),
    )
  }

  async reconnected(gameId: UUID, userId: UUID, events: LifecycleEvents) {
    clearTimeout(this.graceTimers.get(this.key(gameId, userId)))
    this.graceTimers.delete(this.key(gameId, userId))
    clearTimeout(this.deletionTimers.get(gameId))
    this.deletionTimers.delete(gameId)
    const result = await this.gameOperations.run(gameId, async () => {
      const status = this.disconnectedStatuses.get(this.key(gameId, userId)) ?? PlayerStatus.InGame
      const connected = await this.gameService.markPlayerConnected(gameId, userId, status)
      if (!connected) {
        return undefined
      }
      if (!connected.players[userId]?.isHost && (this.hostDeadlines.get(gameId) ?? Number.POSITIVE_INFINITY) <= Date.now()) {
        const transferred = await this.gameService.transferDisconnectedHost(gameId)
        return { game: transferred ?? connected, transferred: !!transferred }
      }
      return { game: connected, transferred: false }
    })
    if (!result) {
      return undefined
    }
    const { game, transferred } = result
    this.disconnectedStatuses.delete(this.key(gameId, userId))

    if (game.players[userId]?.isHost) {
      clearTimeout(this.hostTimers.get(gameId))
      this.hostTimers.delete(gameId)
      this.hostDeadlines.delete(gameId)
    } else if (transferred) {
      this.hostDeadlines.delete(gameId)
      events.onUpdate(game)
      return game
    }
    return game
  }

  explicitLeave(gameId: UUID, userId: UUID) {
    clearTimeout(this.graceTimers.get(this.key(gameId, userId)))
    this.graceTimers.delete(this.key(gameId, userId))
    this.disconnectedStatuses.delete(this.key(gameId, userId))
  }
}
