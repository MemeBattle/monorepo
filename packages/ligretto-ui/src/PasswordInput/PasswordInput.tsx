import type { TextFieldProps } from '@mui/material'
import { TextField as MUIInput } from '@mui/material'
import type { FC } from 'react'
import React from 'react'

export const PasswordInput: FC<Omit<TextFieldProps, 'type'>> = props => <MUIInput variant="standard" type="password" {...props} />
