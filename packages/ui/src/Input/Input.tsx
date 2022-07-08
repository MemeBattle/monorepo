import React from 'react'
import type { TextFieldProps } from '@mui/material'
import { TextField as MUIInput } from '@mui/material'

export const Input: React.FC<TextFieldProps> = props => <MUIInput variant="standard" {...props} />
