import { Action } from 'types/actions'

export enum RoomsTypes {
  FETCH_ROOMS = '@@rooms/FETCH_ROOMS',
}

export type FetchRoomsAction = Action<RoomsTypes.FETCH_ROOMS>

export type RoomsActions = FetchRoomsAction
