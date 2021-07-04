import React from 'react'
import cn from 'classnames'
import styles from './PlayerReadyButton.module.scss'
import playIcon from 'assets/icons/play.svg'
import { Avatar } from '@memebattle/ligretto-ui'

export interface PlayerReadyButtonProps {
  onClick: () => void
  className?: string
  hideButton?: boolean
}
export const PlayerReadyButton: React.FC<PlayerReadyButtonProps> = ({ className, onClick, hideButton }) => (
  <div className={cn(styles.playerReadyButton, className)}>
    <Avatar />
    {hideButton ? null : <img src={playIcon} alt="Ready to play" className={styles.button} onClick={onClick} />}
  </div>
)
