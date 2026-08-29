import type { Game, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { inject, injectable } from 'inversify'

import { ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS, DISCONNECT_GRACE_PERIOD_MS, HOST_HANDOVER_TIMEOUT_MS } from '../../config'
import type { GameService } from '../../entities/game/game.service'
import type { UserService } from '../../entities/user'
import { IOC_TYPES } from '../../IOC_TYPES'

type LifecycleEvents = { onUpdate: (game: Game) => void; onDelete: (gameId: UUID) => void }

@injectable()
export class GameConnectionService {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService

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
    const timer = setTimeout(() => this.expireGrace(gameId, userId, events, timer), DISCONNECT_GRACE_PERIOD_MS)
    this.graceTimers.set(key, timer)
  }

  private expireGrace(gameId: UUID, userId: UUID, events: LifecycleEvents, timer: ReturnType<typeof setTimeout>) {
    const key = this.key(gameId, userId)
    // A reconnect may have cancelled this timer after it was already queued
    // for execution, when clearTimeout can no longer stop it.
    if (this.graceTimers.get(key) !== timer) {
      return
    }
    this.graceTimers.delete(key)

    const transition = this.gameService.markPlayerDisconnectedIfOffline(gameId, userId)
    if (!transition) {
      // No player transition: the user may be a spectator, or a player who is
      // already Disconnected. Either way the room may now be abandoned.
      const withoutSpectator = this.gameService.removeSpectatorIfOffline(gameId, userId)
      if (withoutSpectator) {
        events.onUpdate(withoutSpectator)
      }
      this.scheduleDeletionIfAbandoned(gameId, events)
      return
    }
    const { game, previousStatus } = transition
    this.disconnectedStatuses.set(key, previousStatus)
    events.onUpdate(game)

    if (game.players[userId]?.isHost) {
      this.scheduleHostHandover(gameId, events)
    }
    this.scheduleDeletionIfAbandoned(gameId, events)
  }

  scheduleDeletionIfAbandoned(gameId: UUID, events: LifecycleEvents) {
    const game = this.gameService.getGame(gameId)
    if (!game) {
      return
    }
    const players = Object.values(game.players)
    // Liveness is re-validated atomically when the timer fires; here it is
    // enough that no player is connected any more.
    if (players.length > 0 && players.every(player => player?.status === PlayerStatus.Disconnected)) {
      this.scheduleDeletion(gameId, events)
    }
  }

  private scheduleHostHandover(gameId: UUID, events: LifecycleEvents) {
    clearTimeout(this.hostTimers.get(gameId))
    this.hostDeadlines.set(gameId, Date.now() + HOST_HANDOVER_TIMEOUT_MS)
    this.hostTimers.set(
      gameId,
      setTimeout(() => {
        this.hostTimers.delete(gameId)
        const game = this.gameService.transferDisconnectedHost(gameId)
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
      setTimeout(() => {
        this.deletionTimers.delete(gameId)
        const game = this.gameService.deleteIfAllOffline(gameId)
        if (!game) {
          // A participant held a live socket somewhere (e.g. in the lobby) at
          // expiry. Retry, or the room becomes a permanent zombie: nothing
          // re-arms deletion once this one-shot timer has fired. Any actual
          // rejoin of the room cancels the timer via reconnected().
          if (this.gameService.getGame(gameId)) {
            this.scheduleDeletion(gameId, events)
          }
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

  reconnected(gameId: UUID, userId: UUID, events: LifecycleEvents) {
    const key = this.key(gameId, userId)
    clearTimeout(this.graceTimers.get(key))
    this.graceTimers.delete(key)
    clearTimeout(this.deletionTimers.get(gameId))
    this.deletionTimers.delete(gameId)

    const status = this.disconnectedStatuses.get(key) ?? PlayerStatus.InGame
    const connected = this.gameService.markPlayerConnected(gameId, userId, status)
    if (!connected) {
      return undefined
    }
    this.disconnectedStatuses.delete(key)

    if (connected.players[userId]?.isHost) {
      clearTimeout(this.hostTimers.get(gameId))
      this.hostTimers.delete(gameId)
      this.hostDeadlines.delete(gameId)
      return connected
    }

    // The handover deadline may have passed while its timer callback is still
    // queued behind this handler: resolve the handover deterministically here
    // instead of racing the timer.
    if ((this.hostDeadlines.get(gameId) ?? Number.POSITIVE_INFINITY) <= Date.now()) {
      const transferred = this.gameService.transferDisconnectedHost(gameId)
      if (transferred) {
        this.hostDeadlines.delete(gameId)
        events.onUpdate(transferred)
        return transferred
      }
    }
    return connected
  }

  explicitLeave(gameId: UUID, userId: UUID) {
    const key = this.key(gameId, userId)
    clearTimeout(this.graceTimers.get(key))
    this.graceTimers.delete(key)
    this.disconnectedStatuses.delete(key)
  }
}
