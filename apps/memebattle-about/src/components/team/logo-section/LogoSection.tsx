import React from 'react'
import { MemeBattleIcon } from '🏠/components/icons'
import { Box, Text } from '🏠/components/base'
import styles from './LogoSection.module.scss'

export const LogoSection: React.FC = () => (
  <Box is="section">
    <Box className={styles.logo}>
      <MemeBattleIcon />
    </Box>
    <Text is="h1" className={styles.textHeader}>
      MemeBattle team
    </Text>
  </Box>
)
