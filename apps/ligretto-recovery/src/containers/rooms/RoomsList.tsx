import { connect } from 'react-redux'
import { All } from 'types/store'
import { Rooms } from 'components/blocks/rooms'
import { selectRoomsList } from 'ducks/rooms/selectors'

export const RoomsList = connect(
  (state: All) => ({
    rooms: selectRoomsList(state),
  }),
  {
    onClick: () => null,
  },
)(Rooms)
