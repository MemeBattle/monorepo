import React from 'react'
import cn from 'classnames'
import opponentAvatar from 'assets/icons/avatars/2.svg' // TODO: get avatar from avatars collection
import { Avatar, AvatarSize } from '../shared/avatar'
import { PositionOnTable } from 'components/base/room-grid'
import styles from './OpponentWaiting.module.scss'

export interface OpponentWaitingProps {
  positionOnTable: PositionOnTable
}

const classNameByPositionOnTable = {
  [PositionOnTable.Left]: styles.left,
  [PositionOnTable.Right]: styles.right,
  [PositionOnTable.Top]: styles.top,
  [PositionOnTable.RightTopCorner]: styles.rightTopCorner,
  [PositionOnTable.LeftTopCorner]: styles.leftTopCorner,
}

export const OpponentWaiting: React.FC<OpponentWaitingProps> = ({ positionOnTable }) => (
  <div className={cn(styles.opponentWaiting, classNameByPositionOnTable[positionOnTable])}>
    <Avatar src={opponentAvatar} size={AvatarSize.Small} />
  </div>
)
