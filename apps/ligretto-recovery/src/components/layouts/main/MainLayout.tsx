import React from 'react'
import { BaseLayout } from '../base/BaseLayout'
import { Background } from '@memebattle/ligretto-ui'
import styles from './MainLayout.module.scss'

export const MainLayout: React.FC = ({ children }) => (
  <BaseLayout className={styles.mainLayout}>
    <Background>{children}</Background>
  </BaseLayout>
)
