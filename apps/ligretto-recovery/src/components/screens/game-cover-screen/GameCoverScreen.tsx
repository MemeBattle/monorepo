import React from 'react'
import { BaseScreen } from '../base/BaseScreen'
import styles from './GameCoverScreen.module.scss'

export const GameCoverScreen: React.FC = ({ children }) => <BaseScreen className={styles.gameCoverScreen}>{children}</BaseScreen>
