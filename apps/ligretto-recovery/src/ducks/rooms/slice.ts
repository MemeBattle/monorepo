import type { Room } from '@memebattle/ligretto-shared'
import uniq from 'lodash/uniq'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice, createAction } from '@reduxjs/toolkit'

export type RoomsState = {
  byId: {
    [uuid: string]: Room
  }
  ids: string[]
  isLoading: boolean
  search: string
  error: { error: string } | null
}

const initialState: RoomsState = {
  byId: {},
  ids: [],
  isLoading: false,
  search: '',
  error: null,
}

export const connectToRoomAction = createAction<{ roomUuid: string }>('ConnectToRoomType')
export const createRoomAction = createAction<{ name: string }>('CreateRoomType')

export const roomsSlice = createSlice({
  name: 'rooms',
  initialState,
  reducers: {
    searchRoomsAction: (state, action: PayloadAction<{ search: string }>) => {
      state.isLoading = true
      state.search = action.payload.search
    },
    updateRoomsAction: (state, action: PayloadAction<{ rooms: Room[] }>) => {
      const { byId, ids } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
        ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
        {
          byId: state.byId,
          ids: state.ids,
        },
      )
      return { ...state, byId, ids: uniq(ids) }
    },
    setRoomsAction: (state, action: PayloadAction<{ rooms: Room[] }>) => {
      const { byId: newById, ids: newIds } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
        ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
        {
          byId: {},
          ids: [],
        },
      )
      return { ...state, byId: newById, ids: newIds, isLoading: false }
    },
    setErrorRoomsAction: (state, action: PayloadAction<{ error: { error: string } | null }>) => {
      state.error = action.payload.error
    },
  },
})

export const { searchRoomsAction, updateRoomsAction, setRoomsAction, setErrorRoomsAction } = roomsSlice.actions
export const roomsReducer = roomsSlice.reducer
