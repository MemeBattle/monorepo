import type { Card } from '@memebattle/ligretto-shared'

export type CardInteractionTarget = { type: 'open-stack' } | { type: 'row'; index: number } | { type: 'playground'; index: number }
export type CardDragTarget = Exclude<CardInteractionTarget, { type: 'playground' }>
export type CardDropTarget = Extract<CardInteractionTarget, { type: 'playground' }>

export interface CardDragData {
  target: CardDragTarget
  card: Card
}

export interface CardDropData {
  target: CardDropTarget
  onDrop: (dragged: CardDragData) => void
}
