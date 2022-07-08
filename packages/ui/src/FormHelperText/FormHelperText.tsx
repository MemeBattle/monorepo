import React from 'react'
import type { FormHelperTextProps } from '@mui/material'
import { FormHelperText as MUIFormHelper } from '@mui/material'

export const FormHelperText: React.FC<FormHelperTextProps> = props => <MUIFormHelper {...props} />
