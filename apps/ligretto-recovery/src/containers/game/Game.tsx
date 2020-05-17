import React from 'react'
import { useSelector } from 'react-redux'
import { Player } from '@memebattle/ligretto-shared'
import { selectOpponents } from 'ducks/game'
import { isMultiplyRenderChildren, PositionOnTable, RenderChildren, RoomGrid } from 'components/base/room-grid'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { TableCards, CardsPanel } from 'components/blocks/game'

const renderOpponent: RenderChildren = (positionOnTable: PositionOnTable) => <OpponentCards positionOnTable={positionOnTable} />

const createRenderChildren = (opponents: Player[]) => {
  const renderChild = opponents.map<RenderChildren>(() => renderOpponent)
  if (isMultiplyRenderChildren(renderChild)) {
    return renderChild
  } else {
    throw Error('Opponents are not valid')
  }
}

export const Game = () => {
  const opponents = useSelector(selectOpponents)

  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])

  return (
    <>
      <RoomGrid renderChildren={renderChildren} />
      <TableCards />
      <CardsPanel />
    </>
  )
}
