import React from 'react'
import cn from 'classnames'

import playIcon from 'assets/icons/play.svg'

import styles from './StartGameButton.module.scss'

interface StartGameButtonProps {
  onClick: () => void
  disabled: boolean
}
export const StartGameButton: React.FC<StartGameButtonProps> = ({ onClick, disabled }) => (
  <img src={playIcon} alt="Ready to play" className={cn(styles.button, { [styles.disabled]: disabled })} onClick={disabled ? undefined : onClick} />
)
