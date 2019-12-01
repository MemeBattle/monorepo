import * as dto from './dto'
import { createAction, Action } from '@memebattle/redux-utils'

export enum RoomsTypes {
  SEARCH_ROOMS_FINISH = '@@rooms/SEARCH_ROOMS_FINISH',
  CREATE_ROOM_EMIT = '@@rooms/WEBSOCKET/CREATE_ROOM',
  SEARCH_ROOMS_EMIT = '@@rooms/WEBSOCKET/SEARCH_ROOMS',
  UPDATE_ROOMS = '@@rooms/UPDATE_ROOMS',
}

export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export const searchRoomsFinishAction = createAction<SearchRoomsFinishAction>(RoomsTypes.SEARCH_ROOMS_FINISH)

export type CreateRoomEmitAction = Action<RoomsTypes.CREATE_ROOM_EMIT, dto.CreateGame>
export const createRoomEmitAction = createAction<CreateRoomEmitAction>(RoomsTypes.CREATE_ROOM_EMIT)

export type SearchRoomsEmitAction = Action<RoomsTypes.SEARCH_ROOMS_EMIT, dto.SearchRooms>
export const searchRoomsEmitAction = createAction<SearchRoomsEmitAction>(RoomsTypes.SEARCH_ROOMS_EMIT)

export type UpdateRooms = Action<RoomsTypes.UPDATE_ROOMS, dto.UpdateRooms>
export const updateRooms = createAction<UpdateRooms>(RoomsTypes.UPDATE_ROOMS)
