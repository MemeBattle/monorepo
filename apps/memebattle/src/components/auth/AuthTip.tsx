import React from 'react'
import { Text } from 'components/base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  children: React.ReactNode
}

const AuthTip: React.FC<Props> = ({ children }) => (
  <Text is="span" className={styles.authTip}>
    {children}
  </Text>
)

export default AuthTip
