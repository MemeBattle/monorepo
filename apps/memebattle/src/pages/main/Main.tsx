import React from 'react'
import { Link } from 'react-router-dom'
import { Box } from '@memebattle/components-base'
import { routes } from 'constants.ts'
import { MemeBattleIcon } from 'components/icons'
import { Text } from 'components/base'
import styles from './Main.module.scss'

const MainPage: React.FC = () => (
  <Box className={styles.main}>
    <Text>
      Work in progress, <Link to={routes.SIGN_IN}>check</Link>
    </Text>
    <Box className={styles.iconWrapper}>
      <MemeBattleIcon />
    </Box>
  </Box>
)

export default MainPage
