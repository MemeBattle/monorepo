import type { PropsWithChildren } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { canPlaceCardOnDeck, type CardsDeck } from '@memebattle/ligretto-shared'

import type { PlaygroundDropData } from '../model/types'
import { useOptionalCardPlacement } from './CardPlacementContext'

interface PlaygroundDeckDropTargetProps extends PropsWithChildren {
  deckIndex: number
  deck: CardsDeck | null | undefined
}

export const PlaygroundDeckDropTarget = ({ children, deckIndex, deck }: PlaygroundDeckDropTargetProps) => {
  const placement = useOptionalCardPlacement()
  const activeDrag = placement?.activeDrag
  const enabled = placement?.enabled ?? false
  const data: PlaygroundDropData = { deckIndex, deck }
  const { isOver, setNodeRef } = useDroppable({ id: `playground.${deckIndex}`, data, disabled: !enabled })
  const isValid = !!activeDrag && canPlaceCardOnDeck(activeDrag.card, deck)
  const outline = activeDrag
    ? isValid
      ? isOver
        ? '0 0 0 0.3rem #6ee7a0'
        : '0 0 0 0.2rem rgba(110, 231, 160, 0.7)'
      : isOver
        ? '0 0 0 0.3rem #f87171'
        : undefined
    : undefined

  return (
    <div
      ref={setNodeRef}
      data-card-drop-target={deckIndex}
      data-drop-valid={activeDrag ? isValid : undefined}
      data-drop-over={isOver || undefined}
      style={{ borderRadius: '0.375rem', boxShadow: outline, transition: 'box-shadow 100ms' }}
    >
      {children}
    </div>
  )
}
