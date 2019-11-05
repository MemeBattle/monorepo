import { Rooms } from 'types/store'
import { RoomsActions } from './types'

const initialState: Rooms = {
  byId: {
    room1: {
      name: 'Room1',
      uuid: 'qweqwe',
      playersCount: 2,
      playersMaxCount: 3,
    },
    room2: {
      name: 'Room2',
      uuid: 'qweqwe',
      playersCount: 3,
      playersMaxCount: 3,
    },
    room3: {
      name: 'Room3 qwf qwfqw fqw qwf qwf qwf qwf qwff wqfqwf qwf ',
      uuid: 'qweqwe',
      playersCount: 1,
      playersMaxCount: 3,
    },
    room4: {
      name: 'Room4',
      uuid: 'qweqwe',
      playersCount: 0,
      playersMaxCount: 3,
    },
    room5: {
      name: 'Room5',
      uuid: 'qweqwe',
      playersCount: 3,
      playersMaxCount: 3,
    },
    room6: {
      name: 'Room6',
      uuid: 'qweqwe',
      playersCount: 3,
      playersMaxCount: 3,
    },
  },
  ids: ['room1', 'room2', 'room3', 'room4', 'room5', 'room6'],
  isLoading: false,
}

export const roomsReducer = (state: Rooms = initialState, action: RoomsActions) => {
  switch (action.type) {
    default:
      return state
  }
}
