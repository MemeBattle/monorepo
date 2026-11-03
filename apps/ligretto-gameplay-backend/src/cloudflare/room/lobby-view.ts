import type { Room } from '../../core/game/room'
import type { LobbyRoom } from '../lobby/lobby-store'

export const playerIdsOf = (room: Room) => Object.keys(room.state.players)

export const toLobbyRoom = (room: Room): LobbyRoom => ({
  uuid: room.id,
  name: room.state.name,
  playersCount: playerIdsOf(room).length,
  playersMaxCount: room.state.config.playersMaxCount,
})

/** What the Lobby keeps of a room: the room and its player ids, the ids for a room that comes back after a restart. */
export const lobbyRecordOf = (room: Room) => JSON.stringify([toLobbyRoom(room), playerIdsOf(room)])
