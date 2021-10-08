import type { All } from 'types/store'

export const selectRoomsList = (state: All) => state.rooms.ids.map(id => state.rooms.byId[id])
export const selectRoomsErrors = (state: All) => state.rooms.error
export const selectIsLoading = (state: All) => state.rooms.isLoading
export const selectSearch = (state: All) => state.rooms.search
export const selectIsRoomsListEmpty = (state: All) => state.rooms.ids.length === 0
