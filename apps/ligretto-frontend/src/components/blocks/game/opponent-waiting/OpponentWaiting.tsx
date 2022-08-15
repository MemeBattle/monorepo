import React, { memo, useMemo } from 'react'
import clsx from 'clsx'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { PositionOnTable, Player } from '@memebattle/ui'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

import styles from './OpponentWaiting.module.scss'

export interface OpponentWaitingProps {
  position?: PositionOnTable
  opponentStatus: PlayerStatus
  username: string
  avatar?: string
}

const classNameByStatus = {
  [PlayerStatus.ReadyToPlay]: styles.ready,
  [PlayerStatus.DontReadyToPlay]: styles.waiting,
  [PlayerStatus.InGame]: '',
}

const classNameByPositionOnTable = {
  [PositionOnTable.Left]: styles.left,
  [PositionOnTable.Right]: styles.right,
  [PositionOnTable.Top]: styles.top,
  [PositionOnTable.RightTopCorner]: styles.rightTopCorner,
  [PositionOnTable.LeftTopCorner]: styles.leftTopCorner,
  [PositionOnTable.Bottom]: '',
}

export const OpponentWaiting = memo<OpponentWaitingProps>(({ position, opponentStatus, username, avatar }) => {
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : undefined), [avatar])

  if (!position) {
    return null
  }

  return (
    <div className={clsx(styles.opponentWaiting, classNameByPositionOnTable[position], classNameByStatus[opponentStatus])}>
      <Player avatar={avatarImg} username={username} status={opponentStatus} />
    </div>
  )
})
