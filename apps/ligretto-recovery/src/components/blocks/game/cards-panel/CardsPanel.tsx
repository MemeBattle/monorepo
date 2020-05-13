import React from 'react'
import { CardPositions } from '@memebattle/ligretto-shared'
import { CardContainer } from 'containers/card'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/game/stack'

export const CardsPanel = () => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <Stack />
    </div>
    <div className={styles.cardsWrapper}>
      <CardContainer cardPosition={CardPositions.e} />
      <CardContainer cardPosition={CardPositions.r} />
      <CardContainer cardPosition={CardPositions.t} />
    </div>
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={10} />
    </div>
  </div>
)
