import React from 'react'
import { BaseScreen } from '../base/BaseScreen'
import styles from './MainCoverScreen.module.scss'

export const MainCoverScreen: React.FC = ({ children }) => <BaseScreen className={styles.gameCoverScreen}>{children}</BaseScreen>
