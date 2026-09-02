import type { Card } from '@memebattle/ligretto-shared'

export type CardInteractionTarget = { type: 'open-stack' } | { type: 'row'; index: number }
export type CardDropTarget = { type: 'playground'; index: number }

export interface CardDragData {
  target: CardInteractionTarget
  card: Card
}

export interface CardDropData {
  onDrop: (dragged: CardDragData) => void
}
