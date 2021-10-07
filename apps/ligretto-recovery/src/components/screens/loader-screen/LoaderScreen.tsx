import React from 'react'
import { GameCoverScreen } from '../game-cover-screen'
import { LigrettoLogo, LoaderCards } from '@memebattle/ligretto-ui'
import styles from './LoaderScreen.module.scss'

export const LoaderScreen: React.FC = () => (
  <GameCoverScreen>
    <div className={styles.root}>
      <div className={styles.logo}>
        <LigrettoLogo />
      </div>
      <div className={styles.cards}>
        <LoaderCards />
      </div>
    </div>
  </GameCoverScreen>
)

LoaderScreen.displayName = 'LoaderScreen'
