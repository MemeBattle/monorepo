import * as React from 'react'
import { Box, CheckBox } from '@memebattle/components-base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  className: string
  name: string
  label?: React.ReactNode
  id: string
  value: any
  onChange: (name: string, value: boolean) => any
  children: React.ReactNode
}

const AuthInput: React.FC<Props> = ({ children, ...props }) => (
  <Box is="span" className={styles.authFormRules}>
    <CheckBox {...props} className={styles.authFormRulesCheckbox} />
    <Box is="span">{children}</Box>
  </Box>
)

AuthInput.defaultProps = {
  label: '',
}

export default React.memo(AuthInput)
