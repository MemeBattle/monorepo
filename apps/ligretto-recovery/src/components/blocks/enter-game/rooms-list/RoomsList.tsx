import * as React from 'react'
import classNames from 'classnames/bind'
import { Room } from '@memebattle/ligretto-shared'
import { routes } from 'utils/constants'
import styles from './Rooms.module.scss'
import playIcon from 'assets/icons/play.svg'
import { ButtonLink } from '../../../base/button-link'

const cn = classNames.bind(styles)

interface RoomsProps {
  rooms: Room[]
  onRoomClick: (roomUuid: Room['uuid']) => () => void
}

export const RoomsList: React.FC<RoomsProps> = ({ rooms, onRoomClick }) => (
  <div className={cn(styles.rooms, { [styles.empty]: rooms.length === 0 })}>
    {rooms.map(({ name, uuid, playersCount, playersMaxCount }) => (
      <div title={name} className={cn(styles.room, { disabled: playersCount >= playersMaxCount })} key={uuid} onClick={onRoomClick(uuid)}>
        <span className={styles.name}>{name}</span>
        <span className={styles.players}>
          {playersCount}/{playersMaxCount}
        </span>
        <img className={styles.play} src={playIcon} alt="play" />
      </div>
    ))}
    {rooms.length === 0 ? (
      <div className={styles.notFound}>
        <h2>Rooms not found</h2>
        <ButtonLink to={routes.CREATE_ROOM}>Create</ButtonLink>
      </div>
    ) : null}
  </div>
)
