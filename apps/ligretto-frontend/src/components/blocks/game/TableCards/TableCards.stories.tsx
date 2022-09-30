import { TableCards } from './TableCards'
import { CardPlace } from '../CardPlace'

export default {
  title: 'Ligretto / TableCards',
}

export const DefaultView = () => (
  <TableCards>
    {Array(12)
      .fill(1)
      .map((_, index) => (
        <CardPlace key={index} />
      ))}
  </TableCards>
)
