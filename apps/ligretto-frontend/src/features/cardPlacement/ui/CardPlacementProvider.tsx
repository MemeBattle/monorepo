import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useDispatch, useSelector } from 'react-redux'
import { canPlaceCardOnDeck } from '@memebattle/ligretto-shared'

import { gameIdSelector } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { getCardPlacementAction } from '../model/getCardPlacementAction'
import type { CardDragData, CardPlacementTarget, PlaygroundDropData } from '../model/types'
import { CardPlacementContext } from './CardPlacementContext'

interface CardPlacementProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardPlacementProvider = ({ children, enabled }: CardPlacementProviderProps) => {
  const dispatch = useDispatch()
  const gameId = useSelector(gameIdSelector)
  const { clearFocus } = useCardFocus()
  const [activeDrag, setActiveDrag] = useState<CardDragData>()
  const sources = useRef(new Map<string, CardDragData>())
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const placeCard = useCallback(
    (target: CardPlacementTarget, playgroundDeckIndex: number) => {
      if (!enabled) {
        return false
      }
      dispatch(getCardPlacementAction(target, gameId, playgroundDeckIndex))
      return true
    },
    [dispatch, enabled, gameId],
  )

  useEffect(() => {
    if (!enabled) {
      setActiveDrag(undefined)
    }
  }, [enabled])

  const registerSource = useCallback((source: CardDragData) => {
    sources.current.set(source.id, source)
    return () => {
      if (sources.current.get(source.id) === source) {
        sources.current.delete(source.id)
      }
      setActiveDrag(current => (current?.id === source.id ? undefined : current))
    }
  }, [])

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (!enabled) {
      return
    }
    const dragged = active.data.current as CardDragData | undefined
    if (dragged && sources.current.has(dragged.id)) {
      setActiveDrag(dragged)
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const dragged = active.data.current as CardDragData | undefined
    const drop = over?.data.current as PlaygroundDropData | undefined
    const currentSource = dragged && sources.current.get(dragged.id)
    if (dragged && currentSource === dragged && drop && canPlaceCardOnDeck(dragged.card, drop.deck)) {
      if (placeCard(dragged.target, drop.deckIndex)) {
        clearFocus()
      }
    }
    setActiveDrag(undefined)
  }

  const handleDragCancel = (_event: DragCancelEvent) => setActiveDrag(undefined)

  const value = useMemo(() => ({ activeDrag, enabled, placeCard, registerSource }), [activeDrag, enabled, placeCard, registerSource])

  return (
    <CardPlacementContext value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay>{activeDrag ? <Card {...activeDrag.card} data-card-drag-overlay /> : null}</DragOverlay>
      </DndContext>
    </CardPlacementContext>
  )
}
