import { createAction } from '@memebattle/redux-utils'
import type { ConnectToRoomAction, SearchRoomsAction, UpdateRoomsAction, SetRoomsAction, CreateRoomAction } from './types'
import { RoomsTypes } from './types'

export const connectToRoomAction = createAction<ConnectToRoomAction>(RoomsTypes.CONNECT_TO_ROOM)
export const searchRoomsAction = createAction<SearchRoomsAction>(RoomsTypes.SEARCH_ROOMS)
export const updateRoomsAction = createAction<UpdateRoomsAction>(RoomsTypes.UPDATE_ROOMS)
export const createRoomAction = createAction<CreateRoomAction>(RoomsTypes.CREATE_ROOM)
export const setRoomsAction = createAction<SetRoomsAction>(RoomsTypes.SET_ROOMS)
