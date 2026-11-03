import { DurableObject } from 'cloudflare:workers'
import type { UUID } from '@memebattle/ligretto-shared'
import { createRoomEmitAction, createRoomSuccessAction, getRoomsEmitAction, removeRoomAction, updateRoomsAction } from '@memebattle/ligretto-shared'
import { createGame } from '@memebattle/ligretto-core-client/internal'
import type { AnyAction, Handlers } from '../../core/actions'
import { dispatch, on, parseAction } from '../../core/actions'
import type { Connection } from '../../core/ports'
import { createCoreClient } from '../core-client'
import type { Env } from '../env'
import type { LobbyRoom } from './lobby-store'
import { createSqlLobbyStore } from './lobby-store'
import { heartbeatAutoResponse, SocketConnection } from '../socket-connection'

export const ROOMS_PER_HOST = 5

/** The one Lobby: the list of rooms everybody sees, the creation of a room and the host it runs on. */
export class LobbyDO extends DurableObject<Env> {
  private readonly rooms = createSqlLobbyStore(this.ctx.storage.sql)
  private readonly core = createCoreClient(this.env)

  private readonly handlers: Handlers<Connection, Promise<void> | void> = {
    [getRoomsEmitAction.type]: connection => this.sendRooms(connection),
    [createRoomEmitAction.type]: on(createRoomEmitAction, (connection: Connection, { name }) => this.createRoom(connection, name)),
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(heartbeatAutoResponse())
  }

  /** A connection to the Lobby is the request for its rooms: there is no separate message for it. */
  override async fetch() {
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)

    this.sendRooms(new SocketConnection(server))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const action = parseAction(raw)
    if (!action) {
      return
    }
    try {
      await dispatch(this.handlers, new SocketConnection(socket), action)
    } catch (error) {
      console.error('A message failed', { type: action.type, error })
    }
  }

  resolveHost(roomId: string) {
    return this.rooms.hostOf(roomId)
  }

  getRoomsOfHost(hostId: string) {
    return this.rooms.roomsOfHost(hostId)
  }

  updateRoom(room: LobbyRoom, playerIds: string[]) {
    if (this.rooms.update(room, playerIds)) {
      this.broadcast(updateRoomsAction({ rooms: [room] }))
    }
  }

  removeRoom(roomId: string) {
    if (this.rooms.remove(roomId)) {
      this.broadcast(removeRoomAction({ uuid: roomId }))
    }
  }

  private sendRooms(connection: Connection) {
    connection.send(updateRoomsAction({ rooms: this.rooms.list() }))
  }

  private async createRoom(connection: Connection, name: unknown) {
    if (typeof name !== 'string' || name === '') {
      return
    }
    let placed: Awaited<ReturnType<LobbyDO['placeRoom']>>
    try {
      const created = await createGame({ client: this.core })
      if (created.kind !== 'success') {
        // The protocol has no error code to tell the creator.
        console.error('ligretto-core did not create a game', { name, result: created })
        return
      }

      placed = await this.placeRoom({ id: created.data.id, name })
    } catch (error) {
      console.error('Creating a room failed', { name, error })
      return
    }

    this.broadcast(updateRoomsAction({ rooms: [placed.room] }))
    connection.send(createRoomSuccessAction({ game: placed.game }))
  }

  /** A create that runs while this one waits on the host sees the same loads, so `ROOMS_PER_HOST` is a soft limit. */
  private async placeRoom(newRoom: { id: UUID; name: string }) {
    const hostId = this.chooseHost()
    const placed = await this.env.ROOM.get(this.env.ROOM.idFromName(hostId)).initRoom(newRoom)
    this.rooms.add(placed.room, hostId)

    return placed
  }

  /** The fullest host with a free slot, so partly empty hosts drain and stop billing sooner. */
  private chooseHost() {
    const [fullest] = this.rooms
      .hostLoads()
      .filter(({ rooms }) => rooms < ROOMS_PER_HOST)
      .sort((left, right) => right.rooms - left.rooms)

    return fullest?.hostId ?? `host-${crypto.randomUUID()}`
  }

  private broadcast(action: AnyAction) {
    for (const socket of this.ctx.getWebSockets()) {
      new SocketConnection(socket).send(action)
    }
  }
}
