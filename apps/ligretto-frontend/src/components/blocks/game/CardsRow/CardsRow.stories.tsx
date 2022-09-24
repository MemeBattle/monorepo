import { CardsRow } from './CardsRow'
import { CardColors } from '@memebattle/ligretto-shared'

import { Card } from '../Card'

export default {
  title: 'Ligretto / CardsRow',
}

export const DefaultView = () => (
  <CardsRow>
    <Card color={CardColors.blue} value={1} />
    <Card color={CardColors.red} value={5} />
    <Card color={CardColors.yellow} value={10} />
  </CardsRow>
)
