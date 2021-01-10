import type { TextFieldProps } from '@material-ui/core'
import { TextField as MUIInput } from '@material-ui/core'
import type { FC } from 'react'
import React from 'react'

export const PasswordInput: FC<Omit<TextFieldProps, 'type'>> = props => <MUIInput type="password" {...props} />
