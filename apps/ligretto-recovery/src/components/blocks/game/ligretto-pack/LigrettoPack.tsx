import React from 'react'
import { CardPositions } from '@memebattle/ligretto-shared'
import { CardContainer } from 'containers/card'
import styles from './LigrettoPack.module.scss'

interface LigrettoPack {
  count: number
}
export const LigrettoPack: React.FC<LigrettoPack> = ({ count }) => (
  <div className={styles.ligrettoPack}>
    <div className={styles.cardWrapper}>
      <CardContainer cardPosition={CardPositions.y} />
    </div>
    <span className={styles.title}>Осталось в колоде: {count} </span>
  </div>
)
