import type { Action } from '@memebattle/redux-utils'
import type { Room } from '@memebattle/ligretto-shared'

export enum RoomsTypes {
  CREATE_ROOM = '@@rooms/CREATE_ROOM',
  CONNECT_TO_ROOM = '@@rooms/CONNECT_TO_ROOM',
  SEARCH_ROOMS = '@@rooms/SEARCH_ROOMS',
  UPDATE_ROOMS = '@@rooms/UPDATE_ROOMS',
  SET_ROOMS = '@@rooms/SET_ROOMS',
}

export type ConnectToRoomAction = Action<RoomsTypes.CONNECT_TO_ROOM, { roomUuid: string }>
export type SearchRoomsAction = Action<RoomsTypes.SEARCH_ROOMS, { search: string }>
export type UpdateRoomsAction = Action<RoomsTypes.UPDATE_ROOMS, { rooms: Room[] }>
export type SetRoomsAction = Action<RoomsTypes.SET_ROOMS, { rooms: Room[] }>
export type CreateRoomAction = Action<RoomsTypes.CREATE_ROOM, { name: string }>

export type RoomsActions = ConnectToRoomAction | SearchRoomsAction | UpdateRoomsAction | CreateRoomAction | SetRoomsAction
