import React from 'react'
import { CardPositions } from 'types/entities/card-model'
import { CardContainer } from 'containers/card'
import { LigrettoPack } from 'components/blocks/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/stack'

export const CardsPanel = () => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <Stack />
    </div>
    <div className={styles.cardsWrapper}>
      <CardContainer cardPosition={CardPositions.w} />
      <CardContainer cardPosition={CardPositions.e} />
      <CardContainer cardPosition={CardPositions.r} />
    </div>
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={10} />
    </div>
  </div>
)
