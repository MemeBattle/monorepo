import type { RoomDO } from './room/room-do'
import type { LobbyDO } from './lobby/lobby-do'

export interface Env {
  LOBBY: DurableObjectNamespace<LobbyDO>
  ROOM: DurableObjectNamespace<RoomDO>
  CAS_ISSUER: string
  LIGRETTO_CORE_URL: string
  LIGRETTO_INTERNAL_API_TOKEN: string
}
