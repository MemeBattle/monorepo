import React from 'react'
import cn from 'classnames'
import opponentAvatar from 'assets/icons/avatars/3.svg' // TODO: get avatar from avatars collection
import { Avatar, AvatarSize } from '../../../shared/avatar'
import styles from './PlayerReadyButton.module.scss'
import playIcon from 'assets/icons/play.svg'

export interface PlayerReadyButtonProps {
  onClick: () => void
  className?: string
  hideButton?: boolean
}
export const PlayerReadyButton: React.FC<PlayerReadyButtonProps> = ({ className, onClick, hideButton }) => (
  <div className={cn(styles.playerReadyButton, className)}>
    <Avatar src={opponentAvatar} size={AvatarSize.Large} />
    {hideButton ? null : <img src={playIcon} alt="Ready to play" className={styles.button} onClick={onClick} />}
  </div>
)
