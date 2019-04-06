import * as React from 'react'
import { Input } from '@memebattle/components-base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  id: string
  value: any
  type: string
  name: string
  placeholder: string
  onInput: (name: string, value: string) => any
}

const AuthInput: React.FC<Props> = props => <Input {...props} className={styles.input} />

export default React.memo(AuthInput)
