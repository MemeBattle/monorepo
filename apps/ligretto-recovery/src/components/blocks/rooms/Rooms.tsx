import * as React from 'react'
import { Room } from '@memebattle/ligretto-shared'
import styles from './Rooms.module.scss'

interface RoomsProps {
  rooms: Room[]
  onClick: (roomId: string) => void
}

export const Rooms: React.FC<RoomsProps> = ({ rooms, onClick }) => (
  <div className={styles.rooms}>
    {rooms.map(({ name, uuid, playersCount, playersMaxCount }) => (
      <div key={uuid}>
        <span>{name}</span>
        <span>
          {playersCount}/{playersMaxCount}
        </span>
        {playersCount < playersMaxCount ? 'play' : null}
      </div>
    ))}
  </div>
)
