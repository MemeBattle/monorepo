import type { Card } from '@memebattle/ligretto-shared'

export type CardPlacementTarget = { type: 'open-stack' } | { type: 'row'; index: number }

export interface CardDragData {
  target: CardPlacementTarget
  card: Card
}

export interface PlaygroundDropData {
  onDrop: (dragged: CardDragData) => void
}
