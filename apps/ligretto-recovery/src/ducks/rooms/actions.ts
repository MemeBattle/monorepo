import { createAction } from 'utils/create-action'
import { ConnectToRoom, FetchRoomsAction, RoomsTypes } from './types'

export const fetchRoomsAction = createAction<FetchRoomsAction>(RoomsTypes.FETCH_ROOMS)
export const connectToRoomAction = createAction<ConnectToRoom>(RoomsTypes.CONNECT_TO_ROOM)
