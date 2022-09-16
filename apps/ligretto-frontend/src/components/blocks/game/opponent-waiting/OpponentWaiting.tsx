import React, { memo, useMemo } from 'react'
import clsx from 'clsx'
import type { UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { PositionOnTable, Box } from '@memebattle/ui'

import { Player } from '../Player'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

import styles from './OpponentWaiting.module.scss'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

export interface OpponentWaitingProps {
  position?: PositionOnTable
  opponentStatus: PlayerStatus
  username: string
  avatar?: string
  id: UUID
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

export const OpponentWaiting = memo<OpponentWaitingProps>(({ position, opponentStatus, username, avatar, id }) => {
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  if (!position) {
    return null
  }

  return (
    <Box
      data-test-id="opponentWaiting"
      className={clsx(styles.opponentWaiting, classNameByPositionOnTable[position], classNameByStatus[opponentStatus])}
    >
      <Player avatar={avatarImg} username={username} status={opponentStatus} />
    </Box>
  )
})
