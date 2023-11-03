import { createSelector } from '@reduxjs/toolkit'
import type { All } from 'types/store'
import { roomsEntityAdapter } from '#ducks/rooms/slice'

const roomsEntitiesSelectors = roomsEntityAdapter.getSelectors<All>(state => state.rooms)

export const roomsListSelector = roomsEntitiesSelectors.selectAll
export const roomsErrorSelector = (state: All) => state.rooms.error
export const isLoadingSelector = (state: All) => state.rooms.isLoading
export const searchSelector = (state: All) => state.rooms.search
export const isRoomsListEmptySelector = (state: All) => roomsEntitiesSelectors.selectTotal(state) === 0
export const foundRoomsSelector = createSelector(roomsListSelector, searchSelector, (roomsList, search) => {
  const lowCaseSearch = search.toLowerCase()
  return search ? roomsList.filter(room => room.name.toLowerCase().includes(lowCaseSearch)) : roomsList
})
