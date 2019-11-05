import { All } from 'types/store'

export const selectRoomsList = (state: All) => state.rooms.ids.map(id => state.rooms.byId[id])
export const selectIsLoading = (state: All) => state.rooms.isLoading
