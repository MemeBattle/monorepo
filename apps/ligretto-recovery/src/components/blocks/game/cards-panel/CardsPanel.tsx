import React from 'react'
import { CardPositions } from '@memebattle/ligretto-shared'
import { CardsRow } from '@memebattle/ligretto-ui'
import { CardContainer } from 'containers/card'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/game/stack'

export const CardsPanel = () => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <Stack />
    </div>
    <CardsRow>
      <CardContainer cardPosition={CardPositions.e} />
      <CardContainer cardPosition={CardPositions.r} />
      <CardContainer cardPosition={CardPositions.t} />
    </CardsRow>
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={10} />
    </div>
  </div>
)
