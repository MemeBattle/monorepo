import { Action } from '@memebattle/redux-utils'
import { Room, dto } from '@memebattle/ligretto-shared'

export enum RoomsTypes {
  CREATE_ROOM = '@@rooms/CREATE_ROOM',
  CONNECT_TO_ROOM = '@@rooms/CONNECT_TO_ROOM',
  SEARCH_ROOMS = '@@rooms/SEARCH_ROOMS',
  SEARCH_ROOMS_FINISH = '@@rooms/SEARCH_ROOMS_FINISH',
  UPDATE_ROOMS = '@@rooms/UPDATE_ROOMS',
}

export type ConnectToRoomAction = Action<RoomsTypes.CONNECT_TO_ROOM, { roomUuid: string }>
export type SearchRoomsAction = Action<RoomsTypes.SEARCH_ROOMS, { search: string }>
export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export type UpdateRoomsAction = Action<RoomsTypes.UPDATE_ROOMS, { rooms: Room[] }>
export type CreateRoomAction = Action<RoomsTypes.CREATE_ROOM, { name: string }>

export type RoomsActions = ConnectToRoomAction | SearchRoomsAction | UpdateRoomsAction | SearchRoomsFinishAction | CreateRoomAction
