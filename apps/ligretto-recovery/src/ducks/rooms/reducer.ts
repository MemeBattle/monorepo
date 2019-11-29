import { Rooms } from 'types/store'
import { RoomsTypes, RoomsActions } from './types'
import { Room } from '@memebattle/ligretto-shared'

const initialState: Rooms = {
  byId: {},
  ids: [],
  isLoading: false,
}

export const roomsReducer = (state: Rooms = initialState, action: RoomsActions) => {
  switch (action.type) {
    case RoomsTypes.SEARCH_ROOMS:
      return {
        ...state,
        isLoading: true,
      }
    case RoomsTypes.UPDATE_ROOMS:
      const { byId, ids } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
        ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
        {
          byId: {},
          ids: [],
        },
      )
      return { ...state, byId, ids, isLoading: false }
    default:
      return state
  }
}
