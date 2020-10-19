import React from 'react'
import { CardContainer } from 'containers/card'
import { CardsRow } from '@memebattle/ligretto-ui'
import { CardPositions } from '@memebattle/ligretto-shared'

export const Stack: React.FC = () => (
  <CardsRow>
    <CardContainer cardPosition={CardPositions.q} />
    <CardContainer cardPosition={CardPositions.w} />
  </CardsRow>
)
