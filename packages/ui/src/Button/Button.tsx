import type { ButtonProps as MUIButtonProps } from '@mui/material'
import { Button as MUIButton } from '@mui/material'
import type { FC } from 'react'

export type ButtonProps = MUIButtonProps

export const Button: FC<ButtonProps> = MUIButton
