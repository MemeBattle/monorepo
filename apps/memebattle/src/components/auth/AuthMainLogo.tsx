import React from 'react'
import { Box } from '@memebattle/components-base'
import { MemeBattleIcon } from 'components/icons'
import styles from './styles/AuthStyles.module.scss'

const AuthMainLogo: React.FC = () => (
  <Box className={styles.authLogo}>
    <MemeBattleIcon />
  </Box>
)

export default AuthMainLogo
