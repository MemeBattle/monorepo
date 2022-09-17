import React from 'react'
import { Background } from './Background'

import { BaseLayout } from '../base/BaseLayout'
import styles from './MainLayout.module.scss'

export const MainLayout: React.FC = ({ children }) => (
  <BaseLayout className={styles.mainLayout}>
    <Background>{children}</Background>
  </BaseLayout>
)
