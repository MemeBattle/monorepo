import type { UUID } from '@memebattle/ligretto-shared'

export interface LobbyRoom {
  uuid: UUID
  name: string
  playersCount: number
  playersMaxCount: number
}

const parsePlayerIds = (players: string): UUID[] => JSON.parse(players)

export interface LobbyStore {
  list(): LobbyRoom[]
  /** Keeps what the room was listed with. `false` when the room is gone, so a late update cannot bring it back. */
  update(room: LobbyRoom, playerIds: UUID[]): boolean
  /** `false` when the room was already gone. */
  remove(roomId: UUID): boolean
  add(room: LobbyRoom, hostId: string): void
  hostLoads(): Array<{ hostId: string; rooms: number }>
  /** `undefined` for an unknown room. */
  hostOf(roomId: UUID): string | undefined
  /** What a waking host needs to bring its rooms back. */
  roomsOfHost(hostId: string): Array<{ roomId: UUID; name: string; playerIds: UUID[] }>
}

export const createSqlLobbyStore = (sql: SqlStorage): LobbyStore => {
  sql.exec(`CREATE TABLE IF NOT EXISTS rooms(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL,
    host_id TEXT NOT NULL,
    players TEXT NOT NULL DEFAULT '[]')`)

  return {
    list: () =>
      sql
        .exec<{ data: string }>('SELECT data FROM rooms')
        .toArray()
        .map(({ data }) => JSON.parse(data) as LobbyRoom),
    hostLoads: () =>
      sql
        .exec<{ host_id: string; rooms: number }>('SELECT host_id, COUNT(*) AS rooms FROM rooms GROUP BY host_id')
        .toArray()
        .map(row => ({ hostId: row.host_id, rooms: row.rooms })),
    add: (room, hostId) => {
      sql.exec('INSERT INTO rooms(id, name, data, host_id) VALUES(?, ?, ?, ?)', room.uuid, room.name, JSON.stringify(room), hostId)
    },
    hostOf: roomId => sql.exec<{ host_id: string }>('SELECT host_id FROM rooms WHERE id = ?', roomId).toArray()[0]?.host_id,
    roomsOfHost: hostId =>
      sql
        .exec<{ id: string; name: string; players: string }>('SELECT id, name, players FROM rooms WHERE host_id = ?', hostId)
        .toArray()
        .map(row => ({ roomId: row.id, name: row.name, playerIds: parsePlayerIds(row.players) })),
    update: (room, playerIds) =>
      sql.exec('UPDATE rooms SET data = ?, players = ? WHERE id = ?', JSON.stringify(room), JSON.stringify(playerIds), room.uuid).rowsWritten > 0,
    remove: roomId => sql.exec('DELETE FROM rooms WHERE id = ?', roomId).rowsWritten > 0,
  }
}
