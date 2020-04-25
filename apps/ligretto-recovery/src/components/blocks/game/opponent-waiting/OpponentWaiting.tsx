import React from 'react'
import cn from 'classnames'
import opponentAvatar from 'assets/icons/avatars/2.svg' // TODO: get avatar from avatars collection
import { Avatar, AvatarSize } from '../../../shared/avatar'
import { PositionOnTable } from 'components/base/room-grid'
import styles from './OpponentWaiting.module.scss'

export enum OpponentStatus {
  Waiting = 'waiting',
  Ready = 'ready',
}

export interface OpponentWaitingProps {
  positionOnTable: PositionOnTable
  opponentStatus: OpponentStatus
}

const classNameByStatus = {
  [OpponentStatus.Ready]: styles.ready,
  [OpponentStatus.Waiting]: styles.waiting,
}

const classNameByPositionOnTable = {
  [PositionOnTable.Left]: styles.left,
  [PositionOnTable.Right]: styles.right,
  [PositionOnTable.Top]: styles.top,
  [PositionOnTable.RightTopCorner]: styles.rightTopCorner,
  [PositionOnTable.LeftTopCorner]: styles.leftTopCorner,
}

export const OpponentWaiting: React.FC<OpponentWaitingProps> = ({ positionOnTable, opponentStatus }) => (
  <div className={cn(styles.opponentWaiting, classNameByPositionOnTable[positionOnTable], classNameByStatus[opponentStatus])}>
    <Avatar src={opponentAvatar} size={AvatarSize.Small} />
    {opponentStatus === OpponentStatus.Ready ? <div>Ready</div> : null}
  </div>
)
