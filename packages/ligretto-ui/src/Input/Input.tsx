import React from 'react'
import type { TextFieldProps } from '@material-ui/core'
import { TextField as MUIInput } from '@material-ui/core'

export const Input: React.FC<TextFieldProps> = props => <MUIInput {...props} />
