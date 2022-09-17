import React from 'react'
import { LoaderCards } from '@memebattle/ui'

import { MainLayout } from 'components/layouts/main'

import { LigrettoLogo } from 'components/LigrettoLogo'

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
