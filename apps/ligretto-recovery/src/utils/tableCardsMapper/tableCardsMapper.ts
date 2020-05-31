import { Card, CardColors } from '@memebattle/ligretto-shared'
import { tablePositions } from '../constants/tableCardsPositions'

type TablePosition = typeof tablePositions[number]

export const tableCardsMapper = (cards: Card[]): Record<TablePosition, Card> =>
  tablePositions.reduce<Record<TablePosition, Card>>(
    (tableCards, cardPosition, index) => ({
      ...tableCards,
      [cardPosition]: { color: CardColors.empty, ...cards[index], position: tablePositions[index], disabled: true },
    }),
    {} as Record<TablePosition, Card>,
  )
