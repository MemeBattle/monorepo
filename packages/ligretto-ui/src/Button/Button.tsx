import { Button as MUIButton, ButtonProps as MUIButtonProps } from '@material-ui/core'
import { FC } from 'react'

export type ButtonProps = MUIButtonProps

export const Button: FC<ButtonProps> = MUIButton
