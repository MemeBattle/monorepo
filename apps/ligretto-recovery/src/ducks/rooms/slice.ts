import type { Room } from '@memebattle/ligretto-shared'
import uniq from 'lodash/uniq'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice, createAction } from '@reduxjs/toolkit'
import type { Action } from '@memebattle/redux-utils'

export type RoomsState = {
  byId: {
    [uuid: string]: Room
  }
  ids: string[]
  isLoading: boolean
  search: string
}

const initialState: RoomsState = {
  byId: {},
  ids: [],
  isLoading: false,
  search: '',
}

export type ConnectToRoomType = Action<'@@rooms/CONNECT_TO_ROOM', { roomUuid: string }>
export type SearchRoomsAction = Action<'@@rooms/SEARCH_ROOMS', { search: string }>
export type UpdateRoomsAction = Action<'@@rooms/UPDATE_ROOMS', { rooms: Room[] }>
export type SetRoomsAction = Action<'@@rooms/SET_ROOMS', { rooms: Room[] }>
export type CreateRoomType = Action<'@@rooms/CREATE_ROOM', { name: string }>

export const connectToRoomAction = createAction('ConnectToRoomType')
//export const searchRoomsAction = createAction<SearchRoomsAction>(RoomsTypes.SEARCH_ROOMS)
//export const updateRoomsAction = createAction<UpdateRoomsAction>(RoomsTypes.UPDATE_ROOMS)
export const createRoomAction = createAction('CreateRoomType')
//export const setRoomsAction = createAction<SetRoomsAction>(RoomsTypes.SET_ROOMS)

export const roomsSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    searchRoomsActions: (state, action) => ({
      ...state,
      isLoading: true,
      search: action.payload.search,
    }),
    updateRoomsActions: {
      reducer: (state, action: PayloadAction<UpdateRoomsAction>) => {
        const { byId, ids } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
          ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
          {
            byId: state.byId,
            ids: state.ids,
          },
        )
        return { ...state, byId, ids: uniq(ids) }
      },
    },
    setRoomsActions: {
      reducer: (state, action: PayloadAction<SetRoomsAction>) => {
        const { byId: newById, ids: newIds } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
          ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
          {
            byId: {},
            ids: [],
          },
        )
        return { ...state, byId: newById, ids: newIds, isLoading: false }
      },
    },
  },
})

export const { searchRoomsActions, updateRoomsActions, setRoomsActions } = roomsSlice.actions
export const roomsReduce = roomsSlice.reducer
