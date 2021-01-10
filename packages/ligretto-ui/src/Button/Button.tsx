import type { ButtonProps as MUIButtonProps } from '@material-ui/core'
import { Button as MUIButton } from '@material-ui/core'
import type { FC } from 'react'

export type ButtonProps = MUIButtonProps

export const Button: FC<ButtonProps> = MUIButton
