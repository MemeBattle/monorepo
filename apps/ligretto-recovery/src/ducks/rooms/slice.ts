import type { Game, Room } from '@memebattle/ligretto-shared'
import uniq from 'lodash/uniq'
import omit from 'lodash/omit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice, createAction } from '@reduxjs/toolkit'
import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

export type RoomsState = {
  byId: {
    [uuid: string]: Room
  }
  ids: string[]
  isLoading: boolean
  search: string
  error: CreateRoomError | null
}

const initialState: RoomsState = {
  byId: {},
  ids: [],
  isLoading: false,
  search: '',
  error: null,
}

export const connectToRoomAction = createAction<{ roomUuid: string }>('@@rooms/connectToRoom')
export const createRoomAction = createAction<{ name: string; config?: Partial<Game['config']> }>('@@rooms/createRoom')

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
    removeRoomAction: (state, action: PayloadAction<{ uuid: Room['uuid'] }>): RoomsState => {
      const newById = omit(state.byId, action.payload.uuid)
      const newIds = state.ids.filter(id => id !== action.payload.uuid)
      return { ...state, byId: newById, ids: newIds }
    },
    setErrorRoomsAction: (state, action: PayloadAction<{ error: CreateRoomError | null }>) => {
      state.error = action.payload.error
    },
  },
})

export const { searchRoomsAction, updateRoomsAction, setRoomsAction, removeRoomAction, setErrorRoomsAction } = roomsSlice.actions
export const roomsReducer = roomsSlice.reducer
