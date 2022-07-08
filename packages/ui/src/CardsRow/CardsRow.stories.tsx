import { CardsRow } from './CardsRow'
import { Card } from '../Card'
import { CardColors } from '@memebattle/ligretto-shared'

export default {
  title: 'Ligretto-ui / CardsPanel',
}

export const DefaultView = () => (
  <CardsRow>
    <Card color={CardColors.blue} value={1} />
    <Card color={CardColors.red} value={5} />
    <Card color={CardColors.yellow} value={10} />
  </CardsRow>
)
