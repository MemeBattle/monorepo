import * as React from 'react'
import { Input } from '@components/base'
import styles from './AuthStyles.module.scss'

interface Props {
  id: string
  value: any
  type: string
  placeholder: string
  onInput: (value: string) => any
}

const AuthInput: React.FC<Props> = props => <Input {...props} className={styles.authFormInput} />

export default AuthInput
