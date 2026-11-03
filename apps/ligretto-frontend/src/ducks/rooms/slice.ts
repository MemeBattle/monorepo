import type { Room } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice, createAction, createEntityAdapter } from '@reduxjs/toolkit'

export const roomsEntityAdapter = createEntityAdapter({
  selectId: (room: Room) => room.uuid,
})

export interface RoomsState extends ReturnType<typeof roomsEntityAdapter.getInitialState> {
  isLoading: boolean
  search: string
}

const initialState: RoomsState = {
  ...roomsEntityAdapter.getInitialState(),
  isLoading: false,
  search: '',
}

export const connectToRoomAction = createAction<{ roomUuid: string }>('@@rooms/connectToRoom')
export const createRoomAction = createAction<{ name: string }>('@@rooms/createRoom')

export const roomsSlice = createSlice({
  name: 'rooms',
  initialState,
  reducers: {
    getRoomsAction: state => {
      state.isLoading = true
    },
    setSearchRoomsAction: (state, action: PayloadAction<{ search: string }>) => {
      state.search = action.payload.search
    },
    updateRoomsAction: (state, action: PayloadAction<{ rooms: Room[] }>) => {
      roomsEntityAdapter.upsertMany(state, action.payload.rooms)
      state.isLoading = false
    },
    removeRoomAction: (state, action: PayloadAction<{ uuid: Room['uuid'] }>) => {
      roomsEntityAdapter.removeOne(state, action.payload.uuid)
    },
  },
})

export const { getRoomsAction, setSearchRoomsAction, updateRoomsAction, removeRoomAction } = roomsSlice.actions
export const roomsReducer = roomsSlice.reducer
