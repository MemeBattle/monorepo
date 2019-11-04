import { createAction } from 'utils/create-action'
import { RoomsTypes, FetchRoomsAction } from './types'

export const fetchRoomsAction = createAction<FetchRoomsAction>(RoomsTypes.FETCH_ROOMS)
