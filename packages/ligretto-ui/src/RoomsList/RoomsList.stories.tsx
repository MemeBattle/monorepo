import React from 'react'
import { RoomsList } from './RoomsList'
import { Background } from '../story-components'

export default {
  title: 'RoomsList',
}

export const DefaultView = () => (
  <Background bgColor="dark">
    <RoomsList
      rooms={[
        { id: '1', name: 'Room name 1', onClick: () => null, playersCount: 1, playersMaxCount: 4 },
        { id: '2', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
        { id: '3', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
        { id: '4', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
        { id: '5', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4, isDisabled: true },
      ]}
    />
  </Background>
)
