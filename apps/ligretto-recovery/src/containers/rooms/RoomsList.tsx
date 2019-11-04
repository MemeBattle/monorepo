import { connect } from 'react-redux'
import { All } from 'types/store'
import { RoomsList as RoomsListComponent } from 'components/blocks/rooms-list'
import { selectRoomsList } from 'ducks/rooms/selectors'
import { connectToRoomAction } from 'ducks/rooms/actions'

export const RoomsList = connect(
  (state: All) => ({
    rooms: selectRoomsList(state),
  }),
  {
    onClick: connectToRoomAction,
  },
)(RoomsListComponent)
