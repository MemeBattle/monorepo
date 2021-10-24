import React, { useMemo } from 'react'
import cn from 'classnames'
import styles from './PlayerReadyButton.module.scss'
import playIcon from 'assets/icons/play.svg'
import { Player } from '@memebattle/ligretto-ui'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

export interface PlayerReadyButtonProps {
  onClick: () => void
  className?: string
  hideButton?: boolean
  avatar?: string
  username: string
  status: PlayerStatus
}
export const PlayerReadyButton: React.FC<PlayerReadyButtonProps> = ({ className, onClick, hideButton, avatar, username, status }) => {
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : undefined), [avatar])

  return (
    <div className={cn(styles.playerReadyButton, className)}>
      <Player status={status} avatar={avatarImg} username={username} />
      {hideButton ? null : <img src={playIcon} alt="Ready to play" className={styles.button} onClick={onClick} />}
    </div>
  )
}
