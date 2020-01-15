import { createAction } from '@memebattle/redux-utils'
import { ConnectToRoomAction, RoomsTypes, SearchRoomsAction, UpdateRoomsAction, CreateRoomAction, ConnectToRoomEmitAction } from './types'

export const connectToRoomAction = createAction<ConnectToRoomAction>(RoomsTypes.CONNECT_TO_ROOM)
export const connectToRoomEmitAction = createAction<ConnectToRoomEmitAction>(RoomsTypes.CONNECT_TO_ROOM_EMIT)
export const searchRoomsAction = createAction<SearchRoomsAction>(RoomsTypes.SEARCH_ROOMS)
export const updateRoomsAction = createAction<UpdateRoomsAction>(RoomsTypes.UPDATE_ROOMS)
export const createRoomAction = createAction<CreateRoomAction>(RoomsTypes.CREATE_ROOM)
