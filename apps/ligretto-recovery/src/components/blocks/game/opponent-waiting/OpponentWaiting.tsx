import React from 'react'
import cn from 'classnames'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { PositionOnTable } from '@memebattle/ligretto-ui'
import styles from './OpponentWaiting.module.scss'
import { Avatar } from '@memebattle/ligretto-ui'

export interface OpponentWaitingProps {
  positionOnTable: PositionOnTable
  opponentStatus: PlayerStatus
}

const classNameByStatus = {
  [PlayerStatus.ReadyToPlay]: styles.ready,
  [PlayerStatus.DontReadyToPlay]: styles.waiting,
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
    <Avatar size={'small'} />
    {opponentStatus === PlayerStatus.ReadyToPlay ? <div>Ready</div> : null}
  </div>
)
