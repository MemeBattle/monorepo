import * as React from 'react'
import { Box, CheckBox } from '@components/base'
import styles from './AuthStyles.module.scss'

interface Props {
  label?: React.ReactNode
  id: string
  value: any
  onChange: (value: boolean) => any
  children: React.ReactNode
}

const AuthInput: React.FC<Props> = ({ children, ...props }) => (
  <Box is="span" className={styles.authFormCheckbox}>
    <CheckBox {...props} className={styles.authFormCheckbox} />
    <Box is="span">{children}</Box>
  </Box>
)

AuthInput.defaultProps = {
  label: '',
}

export default AuthInput
