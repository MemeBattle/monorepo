import * as React from 'react'
import classNames from 'classnames'

import styles from './Button.module.scss'

export enum ButtonColors {
  Red = 'red',
  Green = 'green',
}

export interface ButtonProps {
  color?: ButtonColors
  onClick?: (e: React.MouseEvent) => void
}

export const Button: React.FC<ButtonProps> = ({ children, color = ButtonColors.Green, onClick }) => (
  <button onClick={onClick} className={classNames(styles.button, color)}>
    {children}
  </button>
)
