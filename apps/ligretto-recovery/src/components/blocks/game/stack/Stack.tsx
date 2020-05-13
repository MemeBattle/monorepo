import React from 'react'
import { CardContainer } from 'containers/card'
import styles from './Stack.module.scss'
import { CardPositions } from '@memebattle/ligretto-shared'

export const Stack: React.FC = () => (
  <div className={styles.stack}>
    <CardContainer cardPosition={CardPositions.q} />
    <CardContainer cardPosition={CardPositions.w} />
  </div>
)
