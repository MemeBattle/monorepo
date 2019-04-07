import React from 'react'
import { Text } from 'components/base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  children: React.ReactNode
}

const AuthTitle: React.FC<Props> = ({ children }) => (
  <Text is="span" className={styles.authTitle}>
    {children}
  </Text>
)

export default AuthTitle
