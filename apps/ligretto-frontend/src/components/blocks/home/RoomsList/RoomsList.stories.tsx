import { RoomsList } from './RoomsList'

export default {
  title: 'Ligretto / RoomsList',
}

export const DefaultView = () => (
  <RoomsList
    rooms={[
      { id: '1', name: 'Room name 1', onClick: () => null, playersCount: 1, playersMaxCount: 4 },
      { id: '2', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
      { id: '3', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
      {
        id: '4',
        name: 'Room name 2 Long name long long long long name Room name 2 Long name long long long long name Room name 2 Long name long long long long name Room name 2 Long name long long long long name',
        onClick: () => null,
        playersCount: 4,
        playersMaxCount: 4,
      },
      { id: '5', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4, isDisabled: true },
    ]}
  />
)
