import React from 'react'
import type { FormHelperTextProps } from '@material-ui/core'
import { FormHelperText as MUIFormHelper } from '@material-ui/core'

export const FormHelper: React.FC<FormHelperTextProps> = props => <MUIFormHelper {...props} />
