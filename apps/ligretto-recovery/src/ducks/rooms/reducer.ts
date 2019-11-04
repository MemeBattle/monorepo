import { Rooms } from 'types/store'
import { RoomsActions } from './types'

const initialState: Rooms = {
  byId: {
    room1: {
      name: 'Room1',
      uuid: 'qweqwe',
      playersCount: 3,
      playersMaxCount: 3,
    },
  },
  ids: ['room1'],
}

export const roomsReducer = (state: Rooms = initialState, action: RoomsActions) => {
  switch (action.type) {
    default:
      return state
  }
}
