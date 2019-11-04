import { Action } from 'types/actions'

export enum RoomsTypes {
  FETCH_ROOMS = '@@rooms/FETCH_ROOMS',
  CONNECT_TO_ROOM = '@@rooms/CONNECT_TO_ROOM',
}

export type FetchRoomsAction = Action<RoomsTypes.FETCH_ROOMS>
export type ConnectToRoom = Action<RoomsTypes.CONNECT_TO_ROOM, { roomUuid: string }>

export type RoomsActions = FetchRoomsAction | ConnectToRoom
