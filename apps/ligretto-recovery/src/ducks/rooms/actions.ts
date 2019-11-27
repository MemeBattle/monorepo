import { createAction } from 'utils/create-action'
import {
  ConnectToRoomAction,
  FetchRoomsAction,
  RoomsTypes,
  SearchRoomsAction,
  SearchRoomsEmitAction,
  UpdateRoomsAction,
  CreateRoomAction,
  CreateRoomEmitAction,
} from './types'

export const fetchRoomsAction = createAction<FetchRoomsAction>(RoomsTypes.FETCH_ROOMS)
export const connectToRoomAction = createAction<ConnectToRoomAction>(RoomsTypes.CONNECT_TO_ROOM)
export const searchRoomsAction = createAction<SearchRoomsAction>(RoomsTypes.SEARCH_ROOMS)
export const searchRoomsEmitAction = createAction<SearchRoomsEmitAction>(RoomsTypes.SEARCH_ROOMS_EMIT)
export const updateRoomsAction = createAction<UpdateRoomsAction>(RoomsTypes.UPDATE_ROOMS)
export const createRoomAction = createAction<CreateRoomAction>(RoomsTypes.CREATE_ROOM)
export const createRoomEmitAction = createAction<CreateRoomEmitAction>(RoomsTypes.CREATE_ROOM_EMIT)
