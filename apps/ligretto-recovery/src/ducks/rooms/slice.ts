import type { Game, Room } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice, createAction, createEntityAdapter } from '@reduxjs/toolkit'
import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

export const roomsEntityAdapter = createEntityAdapter<Room>({
  selectId: room => room.uuid,
})

interface RoomsState extends ReturnType<typeof roomsEntityAdapter.getInitialState> {
  isLoading: boolean
  search: string
  error: CreateRoomError | null
}

const initialState: RoomsState = {
  ...roomsEntityAdapter.getInitialState(),
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
      roomsEntityAdapter.upsertMany(state, action.payload.rooms)
    },
    setRoomsAction: (state, action: PayloadAction<{ rooms: Room[] }>) => {
      roomsEntityAdapter.setAll(state, action.payload.rooms)
      state.isLoading = false
    },
    removeRoomAction: (state, action: PayloadAction<{ uuid: Room['uuid'] }>) => {
      roomsEntityAdapter.removeOne(state, action.payload.uuid)
    },
    setErrorRoomsAction: (state, action: PayloadAction<{ error: CreateRoomError | null }>) => {
      state.error = action.payload.error
    },
  },
})

export const { searchRoomsAction, updateRoomsAction, setRoomsAction, removeRoomAction, setErrorRoomsAction } = roomsSlice.actions
export const roomsReducer = roomsSlice.reducer
