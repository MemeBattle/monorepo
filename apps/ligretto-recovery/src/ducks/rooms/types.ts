import { Action } from 'types/actions'
import { Room, dto } from '@memebattle/ligretto-shared'

export enum RoomsTypes {
  FETCH_ROOMS = '@@rooms/FETCH_ROOMS',
  CONNECT_TO_ROOM = '@@rooms/CONNECT_TO_ROOM',
  SEARCH_ROOMS = '@@rooms/SEARCH_ROOMS',
  SEARCH_ROOMS_EMIT = '@@rooms/WEBSOCKET/SEARCH_ROOMS',
  SEARCH_ROOMS_FINISH = '@@rooms/SEARCH_ROOMS_FINISH',
  UPDATE_ROOMS = '@@rooms/UPDATE_ROOMS',
}

export type FetchRoomsAction = Action<RoomsTypes.FETCH_ROOMS>
export type ConnectToRoomAction = Action<RoomsTypes.CONNECT_TO_ROOM, { roomUuid: string }>
export type SearchRoomsAction = Action<RoomsTypes.SEARCH_ROOMS, { search: string }>
export type SearchRoomsEmitAction = Action<RoomsTypes.SEARCH_ROOMS_EMIT, dto.SearchRooms>
export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export type UpdateRoomsAction = Action<RoomsTypes.UPDATE_ROOMS, { rooms: Room[] }>

export type RoomsActions = FetchRoomsAction | ConnectToRoomAction | SearchRoomsAction | UpdateRoomsAction | SearchRoomsEmitAction | SearchRoomsFinishAction
