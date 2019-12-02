import * as React from 'react'
import styles from './Button.module.scss'
import classNamesBind from 'classnames/bind'

const cx = classNamesBind.bind(styles)
export enum ButtonColors {
  Red = 'red',
  Green = 'green',
}
export interface ButtonProps {
  color?: ButtonColors
}
export const Button: React.FC<ButtonProps> = ({ children, color = ButtonColors.Green }) => (
  <button className={cx(styles.button, color)}>{children}</button>
)
