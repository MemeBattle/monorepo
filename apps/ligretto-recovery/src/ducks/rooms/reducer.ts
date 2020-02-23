import { Rooms } from 'types/store'
import { RoomsTypes, RoomsActions } from './types'
import { Room } from '@memebattle/ligretto-shared'
import uniq from 'lodash/uniq'

const initialState: Rooms = {
  byId: {},
  ids: [],
  isLoading: false,
  search: '',
  isRoomLoading: true,
}

export const roomsReducer = (state: Rooms = initialState, action: RoomsActions) => {
  switch (action.type) {
    case RoomsTypes.SEARCH_ROOMS:
      return {
        ...state,
        isLoading: true,
        search: action.payload.search,
      }
    case RoomsTypes.UPDATE_ROOMS:
      const { byId, ids } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
        ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
        {
          byId: state.byId,
          ids: state.ids,
        },
      )
      return { ...state, byId, ids: uniq(ids) }
    case RoomsTypes.SET_ROOMS:
      const { byId: newById, ids: newIds } = action.payload.rooms.reduce<{ byId: { [roomId: string]: Room }; ids: string[] }>(
        ({ byId, ids }, room) => ({ byId: { ...byId, [room.uuid]: room }, ids: [...ids, room.uuid] }),
        {
          byId: {},
          ids: [],
        },
      )
      return { ...state, byId: newById, ids: newIds, isLoading: false }
    default:
      return state
  }
}
