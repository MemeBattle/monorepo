import { TextField as MUIInput, TextFieldProps } from '@material-ui/core'
import React, { FC } from 'react'

export const PasswordInput: FC<Omit<TextFieldProps, 'type'>> = props => <MUIInput type="password" {...props} />
