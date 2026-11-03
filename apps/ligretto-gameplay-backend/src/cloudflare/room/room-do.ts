import { DurableObject } from 'cloudflare:workers'
import type { Game as GameState, GameResults, UUID } from '@memebattle/ligretto-shared'
import { connectToRoomErrorAction } from '@memebattle/ligretto-shared'
import { getGameResults, saveRound as saveRoundInCore } from '@memebattle/ligretto-core-client/internal'
import { parseAction, type AnyAction } from '../../core/actions'
import { Room } from '../../core/game/room'
import { handleAction } from '../../core/game/game.controller'
import { createGame as newRoomState } from '../../core/game/model/room'
import { lobbyRecordOf, playerIdsOf, toLobbyRoom } from './lobby-view'
import type { RoundToSave } from '../../core/ports'
import { createCoreClient } from '../core-client'
import type { Env } from '../env'
import { rejectMissingRoom } from '../refuse-socket'
import { restoreRoom } from './restore-room'
import { heartbeatAutoResponse, isOpen, SocketConnection } from '../socket-connection'

/** Survives hibernation with the socket. Limited to 16 KiB by the runtime. */
type RoomAttachment = { userId: string; roomId: string; acceptedAt: number }

/** A client pings every 20 s, so this is two missed pings and a slow third. */
const SILENT_SOCKET_TIMEOUT_MS = 45_000
const ROOM_DELETION_TIMEOUT_MS = 120_000
/** Every wake after hibernation asks the Lobby for the rooms again, so this is not much shorter. */
const SWEEP_INTERVAL_MS = 30_000

/** What a call into a room hands back: the round to save, if it ended one. */
type RoomCallResult = ReturnType<typeof handleAction>

const attachmentOf = (socket: WebSocket) => socket.deserializeAttachment() as RoomAttachment

const participantIdsOf = (room: Room) => [...Object.keys(room.state.players), ...Object.keys(room.state.spectators)]

/** A room and what only the object knows about it. */
type HostedRoom = {
  room: Room
  /**
   * When it was left with no connections. Kept in memory only: hibernation forgets it, and the room then goes at the
   * next sweep, so the wait is shorter than `ROOM_DELETION_TIMEOUT_MS` whenever the object sleeps.
   */
  emptySince?: number
  /** Set while the Lobby is asked to delete it: it is gone for every event, and kept only so a failure can be retried. */
  removing?: true
}

/** The rooms sharing one object, and everything around them that only the object can do: sockets, alarm and calls out. */
export class RoomDO extends DurableObject<Env> {
  private readonly rooms = new Map<UUID, HostedRoom>()
  private sweepArmed = false
  private readonly lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('global'))
  private readonly core = createCoreClient(this.env)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(heartbeatAutoResponse())
    void ctx.blockConcurrencyWhile(async () => {
      this.sweepArmed = (await ctx.storage.getAlarm()) !== null
      await this.restoreRooms()
    })
  }

  initRoom({ id, name }: { id: UUID; name: string }) {
    const room = this.addRoom(newRoomState(id, name), undefined, Date.now())

    return { room: toLobbyRoom(room), game: room.state }
  }

  /**
   * Runs on every start, after hibernation or a shutdown. A Lobby failure throws: the rooms cannot be served without
   * their player lists, so the object resets and tries again on its next event. A ligretto-core failure or timeout does
   * not: the room comes back without the table of its last round. A room the deletion failed for is still in the Lobby, so it
   * comes back here and the next sweep tries again.
   */
  private async restoreRooms() {
    const rooms = await this.lobby.getRoomsOfHost(this.ctx.id.name as string)
    const responses = await Promise.all(rooms.map(({ roomId }) => getGameResults({ client: this.core, path: { id: roomId } })))

    rooms.forEach(({ roomId, name, playerIds }, index) => {
      const response = responses[index]
      if (response.kind !== 'success') {
        console.error('ligretto-core did not give the results of a room', { roomId, result: response })
      }

      const results = response.kind === 'success' && Object.keys(response.data.gameResults).length > 0 ? response.data.gameResults : undefined

      const connectedUserIds = this.connectedUserIds(roomId)

      // How long it has been empty was lost with the memory, so nobody is waited for any more.
      const room = this.addRoom(
        restoreRoom({ id: roomId, name, playerIds, connectedUserIds, hasRounds: !!results }),
        results,
        connectedUserIds.length > 0 ? undefined : 0,
      )
      if (connectedUserIds.length > 0) {
        room.showToEveryone()
      }
    })
  }

  private addRoom(state: GameState, results: GameResults | undefined, emptySince: number | undefined) {
    const room = new Room(state, {
      broadcast: (action, exceptUserId) => this.broadcast(state.id, action, exceptUserId),
      results,
    })
    this.rooms.set(state.id, { room, emptySince })
    this.armSweep()

    return room
  }

  override async fetch(request: Request) {
    const userId = request.headers.get('X-User-Id') ?? ''
    const roomId = request.headers.get('X-Room-Id') ?? ''

    const hosted = this.liveRoom(roomId)
    if (!hosted) {
      return rejectMissingRoom()
    }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [roomId])
    server.serializeAttachment({ userId, roomId, acceptedAt: Date.now() } satisfies RoomAttachment)

    this.run(hosted, room => room.join(userId, new SocketConnection(server)))

    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const action = parseAction(raw)
    if (!action) {
      return
    }
    const { roomId, userId } = attachmentOf(socket)
    const connection = new SocketConnection(socket)

    const hosted = this.liveRoom(roomId)

    if (!hosted) {
      connection.send(connectToRoomErrorAction())
      connection.close(1000, 'room not found')
      return
    }
    this.run(hosted, room => handleAction({ room, userId }, action))
  }

  override webSocketClose(socket: WebSocket) {
    const { roomId, userId } = attachmentOf(socket)
    this.connectionClosed(roomId, userId)
  }

  /** A user can hold several connections, and only the last one to go means anything to the room. */
  private connectionClosed(roomId: UUID, userId: UUID) {
    const hosted = this.liveRoom(roomId)
    if (!hosted || this.connectedUserIds(roomId).includes(userId)) {
      return
    }
    this.run(hosted, room => room.disconnect(userId))
  }

  /**
   * Everything a call into a room means outside of it, read from the state before and after. Only the round to save is
   * told: the table it was scored on is cleared by then.
   */
  private run(hosted: HostedRoom, call: (room: Room) => RoomCallResult) {
    const { room } = hosted
    // The room changes in place, so what the call is compared with is taken before it.
    const participantIdsBefore = participantIdsOf(room)
    const lobbyRecordBefore = lobbyRecordOf(room)

    const round = call(room)

    if (round) {
      void this.saveRound(room.id, round)
    }

    if (playerIdsOf(room).length === 0) {
      void this.removeRoom(room.id)
      return
    }

    if (participantIdsBefore.some(userId => !room.hasParticipant(userId))) {
      this.closeUsersWhoLeft(room)
    }

    this.syncDeletion(hosted)

    if (lobbyRecordOf(room) !== lobbyRecordBefore) {
      void this.publishRoom(room)
    }
  }

  /**
   * The round is already closed. The save only decides whether there is a table to show. One attempt: a failure or
   * timeout loses the round in the core, and the log line below is all that is left of it.
   */
  private async saveRound(roomId: UUID, round: RoundToSave) {
    const saved = await saveRoundInCore({ client: this.core, path: { id: roomId }, body: round })

    if (saved.kind !== 'success') {
      // The only record of the round, so its results go into the line.
      console.error('ligretto-core did not save a round', { roomId, round, result: saved })
    }

    const results = saved.kind === 'success' ? saved.data.gameResults : undefined

    const hosted = this.liveRoom(roomId)
    if (!hosted) {
      console.warn('A round save finished after its room was deleted', { roomId, roundId: round.roundId })
      return
    }

    hosted.room.showRoundResults(results)
  }

  /**
   * The room is gone for its connections at once. A Lobby failure leaves it here with nobody in it, so the next sweep
   * tries again and the slot is not lost.
   */
  private async removeRoom(roomId: UUID) {
    const hosted = this.liveRoom(roomId)
    if (!hosted) {
      return
    }

    hosted.removing = true
    hosted.room.close()
    for (const socket of this.openSockets(roomId)) {
      new SocketConnection(socket).close(1000, 'room deleted')
    }

    // Nobody is waited for: the room is over, or the room has been empty for long enough.
    hosted.emptySince = 0
    try {
      await this.lobby.removeRoom(roomId)
      this.rooms.delete(roomId)
    } catch (error) {
      console.error('Deleting a room failed, retrying', { roomId, error })
      hosted.removing = undefined
      // The sweep that would retry it may already have decided not to come back.
      this.armSweep()
    }
  }

  /** The client reopens any socket that closes, unless the room is gone for it. */
  private closeUsersWhoLeft(room: Room) {
    for (const socket of this.openSockets(room.id)) {
      if (!room.hasParticipant(attachmentOf(socket).userId)) {
        const connection = new SocketConnection(socket)
        connection.send(connectToRoomErrorAction())
        connection.close(1000, 'left the room')
      }
    }
  }

  /** A room with no connections is deleted at a sweep, unless someone comes back in time. */
  private syncDeletion(hosted: HostedRoom) {
    if (this.openSockets(hosted.room.id).length > 0) {
      hosted.emptySince = undefined
    } else {
      hosted.emptySince ??= Date.now()
    }
  }

  /** A failure is logged, not thrown: the next change sends the whole room again. */
  private async publishRoom(room: Room) {
    try {
      await this.lobby.updateRoom(toLobbyRoom(room), playerIdsOf(room))
    } catch (error) {
      console.error('Publishing a room failed', { roomId: room.id, error })
    }
  }

  /** The sweep. The runtime disarms the alarm before running it. */
  override async alarm() {
    this.sweepArmed = false
    // First, because closing the last socket of a room starts its wait.
    this.closeSilentSockets()

    const emptiedBefore = Date.now() - ROOM_DELETION_TIMEOUT_MS
    const expired = [...this.rooms.values()].filter(({ emptySince }) => (emptySince ?? Infinity) <= emptiedBefore)
    await Promise.all(expired.map(({ room }) => this.removeRoom(room.id)))

    if ([...this.rooms.values()].some(({ removing }) => !removing)) {
      this.armSweep()
    }
  }

  /** A client that vanished without closing leaves a socket that looks open, and nobody would notice the player is gone. */
  private closeSilentSockets() {
    for (const socket of this.ctx.getWebSockets().filter(isOpen)) {
      const { roomId, userId, acceptedAt } = attachmentOf(socket)
      const lastHeard = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? 0, acceptedAt)
      if (Date.now() - lastHeard > SILENT_SOCKET_TIMEOUT_MS) {
        new SocketConnection(socket).close(1001, 'no heartbeat')
        this.connectionClosed(roomId, userId)
      }
    }
  }

  /** Silence and an empty room are noticed only by looking, so the object wakes to look for as long as it holds a room. */
  private armSweep() {
    if (!this.sweepArmed) {
      this.sweepArmed = true
      void this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS)
    }
  }

  private liveRoom(roomId: UUID) {
    const hosted = this.rooms.get(roomId)
    return hosted?.removing ? undefined : hosted
  }

  /** A closing socket can still be listed, so `readyState` decides what counts as connected. */
  private openSockets(roomId: UUID) {
    return this.ctx.getWebSockets(roomId).filter(isOpen)
  }

  private connectedUserIds(roomId: UUID) {
    return [...new Set(this.openSockets(roomId).map(socket => attachmentOf(socket).userId))]
  }

  private broadcast(roomId: UUID, action: AnyAction, exceptUserId?: UUID) {
    for (const socket of this.openSockets(roomId)) {
      if (attachmentOf(socket).userId !== exceptUserId) {
        new SocketConnection(socket).send(action)
      }
    }
  }
}
