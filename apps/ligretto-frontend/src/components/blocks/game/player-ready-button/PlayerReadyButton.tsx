import React from 'react'
import clsx from 'clsx'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Player } from '../Player'
import playIcon from 'assets/icons/play.svg'

import styles from './PlayerReadyButton.module.scss'

export interface PlayerReadyButtonProps {
  onClick: () => void
  className?: string
  hideButton?: boolean
  avatar?: string
  username: string
  status: PlayerStatus
}
export const PlayerReadyButton: React.FC<PlayerReadyButtonProps> = ({ className, onClick, hideButton, avatar, username, status }) => (
  <div className={clsx(styles.playerReadyButton, className)}>
    <Player status={status} avatar={avatar} username={username} />
    {hideButton ? null : <img src={playIcon} alt="Ready to play" className={styles.button} onClick={onClick} />}
  </div>
)
