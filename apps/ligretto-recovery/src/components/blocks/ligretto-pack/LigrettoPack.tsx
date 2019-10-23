import React from 'react'
import { CardPositions } from 'types/entities/card-model'
import { CardContainer } from 'containers/card'
import styles from './LigrettoPack.module.scss'

interface LigrettoPack {
  count: number
}
export const LigrettoPack: React.FC<LigrettoPack> = ({ count }) => (
  <div className={styles.ligrettoPack}>
    <div className={styles.cardWrapper}>
      <CardContainer cardPosition={CardPositions.w} />
    </div>
    <span className={styles.title}>Осталось в колоде: {count} </span>
  </div>
)
