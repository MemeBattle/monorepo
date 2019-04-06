import * as React from 'react'
import { Box } from '@memebattle/components-base'
import styles from './styles/AuthStyles.module.scss'

interface Props {
  children: React.ReactNode
}

const AuthPage: React.FC<Props> = ({ children }) => (
  <Box className={styles.authPage} is="main">
    {children}
  </Box>
)

export default React.memo(AuthPage)
