import React from 'react'

import { Logo } from 'components/blocks/shared/logo'
import UserHeaderCardContainer from 'containers/user/UserHeaderCard'
import { LOGO_CAPTURE } from 'utils/constants'

import styles from './Home.module.scss'

const HomeHeader: React.FC = ({ children }) => (
  <header className={styles.header}>
    <Logo>{LOGO_CAPTURE}</Logo>
    <UserHeaderCardContainer />
    {children}
  </header>
)

export default HomeHeader
