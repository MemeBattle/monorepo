import * as React from 'react'
import { Room } from '@memebattle/ligretto-shared'
import styles from './Rooms.module.scss'
import playIcon from 'assets/icons/play.svg'
import * as classNames from 'classnames/bind'

const cn = classNames.bind(styles)

interface RoomsProps {
  rooms: Room[]
  onClick: ({ roomUuid }: { roomUuid: string }) => void
  className?: string
}

export const RoomsList: React.FC<RoomsProps> = ({ rooms, onClick, className }) => {
  const onClickRoom = React.useCallback((roomUuid: string) => () => onClick({ roomUuid }), [])

  return (
    <div className={cn(styles.rooms, className)}>
      {rooms.map(({ name, uuid, playersCount, playersMaxCount }) => (
        <div title={name} className={cn(styles.room, { disabled: playersCount >= playersMaxCount })} key={uuid} onClick={onClickRoom(uuid)}>
          <span className={styles.name}>{name}</span>
          <span className={styles.players}>
            {playersCount}/{playersMaxCount}
          </span>
          <img className={styles.play} src={playIcon} alt="play" />
        </div>
      ))}
    </div>
  )
}
