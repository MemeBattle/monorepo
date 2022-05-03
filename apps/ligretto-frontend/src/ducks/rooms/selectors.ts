import type { All } from 'types/store'
import { roomsEntityAdapter } from 'ducks/rooms/slice'

const roomsEntitiesSelectors = roomsEntityAdapter.getSelectors<All>(state => state.rooms)

export const selectRoomsList = roomsEntitiesSelectors.selectAll
export const selectRoomsError = (state: All) => state.rooms.error
export const selectIsLoading = (state: All) => state.rooms.isLoading
export const selectSearch = (state: All) => state.rooms.search
export const selectIsRoomsListEmpty = (state: All) => roomsEntitiesSelectors.selectTotal(state) === 0
