import React, { memo } from 'react'
import cn from 'classnames'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { PositionOnTable } from '@memebattle/ligretto-ui'
import styles from './OpponentWaiting.module.scss'
import { Avatar } from '@memebattle/ligretto-ui'

export interface OpponentWaitingProps {
  position?: PositionOnTable
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

export const OpponentWaiting = memo<OpponentWaitingProps>(({ position, opponentStatus }) => {
  if (!position) {
    return null
  }

  return (
    <div className={cn(styles.opponentWaiting, classNameByPositionOnTable[position], classNameByStatus[opponentStatus])}>
      <Avatar size="small" />
      {opponentStatus === PlayerStatus.ReadyToPlay ? <div>Ready</div> : null}
    </div>
  )
})
