import React from 'react'
import { MainLayout } from 'components/layouts/main'
import { LigrettoLogo, LoaderCards } from '@memebattle/ligretto-ui'
import styles from './LoaderScreen.module.scss'

export const LoaderScreen: React.FC = () => (
  <MainLayout>
    <div className={styles.root}>
      <div className={styles.logo}>
        <LigrettoLogo />
      </div>
      <div className={styles.cards}>
        <LoaderCards />
      </div>
    </div>
  </MainLayout>
)

LoaderScreen.displayName = 'LoaderScreen'
