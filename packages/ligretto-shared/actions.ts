import * as dto from './dto'
import { createAction, Action } from '@memebattle/redux-utils'

export enum RoomsTypes {
  SEARCH_ROOMS_FINISH = '@@rooms/SERVER/SEARCH_ROOMS_FINISH',
  CREATE_ROOM_EMIT = '@@rooms/WEBSOCKET/CREATE_ROOM',
  SEARCH_ROOMS_EMIT = '@@rooms/WEBSOCKET/SEARCH_ROOMS',
  UPDATE_ROOMS_LIST = '@@rooms/SERVER/UPDATE_ROOMS_LIST',
  CONNECT_TO_ROOM_EMIT = '@@rooms/WEBSOCKET/CONNECT_TO_ROOM',
  CONNECT_TO_ROOM_SUCCESS = '@@rooms/SERVER/CONNECT_TO_ROOM_SUCCESS',
}

export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export const searchRoomsFinishAction = createAction<SearchRoomsFinishAction>(RoomsTypes.SEARCH_ROOMS_FINISH)

export type CreateRoomEmitAction = Action<RoomsTypes.CREATE_ROOM_EMIT, dto.CreateGame>
export const createRoomEmitAction = createAction<CreateRoomEmitAction>(RoomsTypes.CREATE_ROOM_EMIT)

export type SearchRoomsEmitAction = Action<RoomsTypes.SEARCH_ROOMS_EMIT, dto.SearchRooms>
export const searchRoomsEmitAction = createAction<SearchRoomsEmitAction>(RoomsTypes.SEARCH_ROOMS_EMIT)

export type UpdateRooms = Action<RoomsTypes.UPDATE_ROOMS_LIST, dto.UpdateRooms>
export const updateRooms = createAction<UpdateRooms>(RoomsTypes.UPDATE_ROOMS_LIST)

export type ConnectToRoomEmitAction = Action<RoomsTypes.CONNECT_TO_ROOM_EMIT, dto.ConnectToRoom>
export const connectToRoomEmitAction = createAction<ConnectToRoomEmitAction>(RoomsTypes.CONNECT_TO_ROOM_EMIT)

export type ConnectToRoomSuccessAction = Action<RoomsTypes.CONNECT_TO_ROOM_SUCCESS>
export const connectToRoomSuccessAction = createAction<ConnectToRoomSuccessAction>(RoomsTypes.CONNECT_TO_ROOM_SUCCESS)
