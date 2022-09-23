import React, { memo, useMemo } from 'react'
import clsx from 'clsx'
import type { UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { Box } from '@memebattle/ui'

import { Player } from '../Player'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

import styles from './OpponentWaiting.module.scss'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

export interface OpponentWaitingProps {
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

export const OpponentWaiting = memo<OpponentWaitingProps>(({ opponentStatus, username, avatar, id }) => {
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  return (
    <Box data-test-id="opponentWaiting" className={clsx(styles.opponentWaiting, classNameByStatus[opponentStatus])}>
      <Player avatar={avatarImg} username={username} status={opponentStatus} />
    </Box>
  )
})
