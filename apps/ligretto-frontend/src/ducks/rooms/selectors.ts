import type { All } from 'types/store'
import { roomsEntityAdapter } from 'ducks/rooms/slice'

const roomsEntitiesSelectors = roomsEntityAdapter.getSelectors<All>(state => state.rooms)

export const roomsListSelector = roomsEntitiesSelectors.selectAll
export const foundRoomsSelector = (state: All) => {
  const rooms = roomsListSelector(state)
  const search = state.rooms.search
  return search ? rooms.filter(room => room.name.toLowerCase().includes(search.toLowerCase())) : rooms
}
export const roomsErrorSelector = (state: All) => state.rooms.error
export const isLoadingSelector = (state: All) => state.rooms.isLoading
export const searchSelector = (state: All) => state.rooms.search
export const isRoomsListEmptySelector = (state: All) => roomsEntitiesSelectors.selectTotal(state) === 0
