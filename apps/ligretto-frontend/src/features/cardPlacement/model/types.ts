import type { Card, CardsDeck } from '@memebattle/ligretto-shared'

export type CardPlacementTarget = { type: 'open-stack' } | { type: 'row'; index: number }

export interface CardDragData {
  id: string
  target: CardPlacementTarget
  card: Card
}

export interface PlaygroundDropData {
  deckIndex: number
  deck: CardsDeck | null | undefined
}
