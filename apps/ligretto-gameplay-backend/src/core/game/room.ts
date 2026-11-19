import type { Game as GameState, GameResults, PlayerStatus, UUID } from '@memebattle/ligretto-shared'
import {
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  endRoundAction,
  updateGameAction,
  userJoinToRoomAction,
} from '@memebattle/ligretto-shared'
import type { AnyAction } from '../actions'
import type { Connection } from '../ports'
import { Gameplay } from './gameplay'
import {
  addPlayer,
  addSpectator,
  canSetReadiness,
  isRoundInProgress,
  joinsAsSpectator,
  leaveRoom,
  markPlayerConnected,
  markPlayerDisconnected,
  removeSpectator,
  setPlayerStatus,
  transferDisconnectedHost,
} from './model/room'

export const DISCONNECT_GRACE_PERIOD_MS = 5_000

interface RoomOptions {
  /** To everyone in the room, or to everyone but one user. */
  broadcast(action: AnyAction, exceptUserId?: UUID): void
  /** The table of the last round, for a room that comes back. */
  results?: GameResults
}

/** One room: who is in it and what state it is in. Its rounds are in `gameplay`. */
export class Room {
  readonly gameplay: Gameplay
  private readonly broadcast: RoomOptions['broadcast']
  /** Plain timers: a room that comes back already counts whoever has no socket as offline. */
  private readonly disconnectTimers = new Map<UUID, ReturnType<typeof setTimeout>>()
  private current: GameState
  private results?: GameResults

  constructor(state: GameState, { broadcast, results }: RoomOptions) {
    this.current = state
    this.broadcast = broadcast
    this.results = results
    this.gameplay = new Gameplay({ getState: () => this.current, save: next => this.save(next), broadcast })
  }

  get id() {
    return this.current.id
  }

  get state() {
    return this.current
  }

  hasParticipant(userId: UUID) {
    return !!this.current.players[userId] || !!this.current.spectators[userId]
  }

  /** A connection to a room is the join: there is no separate message for it. */
  join(userId: UUID, connection: Connection) {
    const isNewcomer = !this.hasParticipant(userId)
    this.stopDisconnectTimer(userId)

    if (isNewcomer) {
      this.save(joinsAsSpectator(this.current) ? addSpectator(this.current, userId) : addPlayer(this.current, userId))
    } else {
      this.save(markPlayerConnected(this.current, userId))
    }
    // The host can only be offline if nobody was online to take over, so the first player in does.
    this.takeOverHost()

    connection.send(connectToRoomSuccessAction({ game: this.current }))
    this.broadcast(updateGameAction(this.current))
    if (isNewcomer) {
      this.broadcast(userJoinToRoomAction({ userId }), userId)
    }
    // The endRound broadcast is ephemeral, so a joining client would otherwise show an empty table until the next round.
    const results = this.resultsToShow()
    if (results) {
      connection.send(endRoundAction(results))
    }
  }

  /** A room that comes back is news to the sockets that outlived the object: they still show the round it lost. */
  showToEveryone() {
    this.broadcast(updateGameAction(this.current))
    const results = this.resultsToShow()
    if (results) {
      this.broadcast(endRoundAction(results))
    }
  }

  /** The user is gone without saying they were leaving: the seat is kept while the player may come back. */
  disconnect(userId: UUID) {
    if (this.hasParticipant(userId)) {
      this.stopDisconnectTimer(userId)
      this.disconnectTimers.set(
        userId,
        setTimeout(() => this.markOffline(userId), DISCONNECT_GRACE_PERIOD_MS),
      )
    }
  }

  /** The user said they are leaving. */
  leave(userId: UUID) {
    this.stopDisconnectTimer(userId)
    this.save(leaveRoom(this.current, userId))

    // The last player is gone: what runs the game deletes the room, and the room shows nothing more.
    if (Object.keys(this.current.players).length > 0) {
      this.broadcast(updateGameAction(this.current))
    }
  }

  setReadiness(userId: UUID, status: PlayerStatus) {
    if (!canSetReadiness(this.current, userId, status)) {
      return
    }
    this.save(setPlayerStatus(this.current, userId, status))
    this.broadcast(updateGameAction(this.current))
  }

  /** The table of the last round. Nothing after a failed save, so no table is left from an earlier round. */
  showRoundResults(results?: GameResults) {
    this.results = results
    if (results && !isRoundInProgress(this.current)) {
      this.broadcast(endRoundAction(results))
    }
  }

  /** The room is being deleted, and nothing may show after it. */
  close() {
    this.gameplay.stop()
    this.disconnectTimers.forEach(timer => clearTimeout(timer))
    this.disconnectTimers.clear()
    // Spectators can outlast the last player, and the room is gone for them too.
    this.broadcast(connectToRoomErrorAction())
  }

  private resultsToShow() {
    return this.results && !isRoundInProgress(this.current) && Object.keys(this.results).length > 0 ? this.results : undefined
  }

  private stopDisconnectTimer(userId: UUID) {
    const timer = this.disconnectTimers.get(userId)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.disconnectTimers.delete(userId)
    }
  }

  /** The seat is kept while the player may come back; a spectator has nothing to come back to. */
  private markOffline(userId: UUID) {
    this.disconnectTimers.delete(userId)
    const next = markPlayerDisconnected(this.current, userId) ?? removeSpectator(this.current, userId)

    if (!next) {
      return
    }

    this.save(next)
    this.takeOverHost()
    this.broadcast(updateGameAction(this.current))
  }

  private takeOverHost() {
    const transferred = transferDisconnectedHost(this.current)
    if (transferred) {
      this.save(transferred)
    }
  }

  private save(next: GameState) {
    this.current = next
  }
}
