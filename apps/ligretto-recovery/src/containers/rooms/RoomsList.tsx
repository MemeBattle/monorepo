import { connect } from 'react-redux'
import { All } from 'types/store'
import { RoomsList as RoomsListComponent } from 'components/blocks/enter-game/rooms-list'
import { selectRoomsList } from 'ducks/rooms/selectors'

export const RoomsList = connect((state: All) => ({
  rooms: selectRoomsList(state),
}))(RoomsListComponent)
