import { TableCards } from './TableCards'
import { CardPlace } from '@memebattle/ligretto-frontend/src/components/blocks/game/CardPlace'

export default {
  title: 'Ligretto-ui / TableCards',
}

export const DefaultView = () => (
  <TableCards>
    {Array(10)
      .fill(1)
      .map((_, index) => (
        <CardPlace key={index} />
      ))}
  </TableCards>
)
