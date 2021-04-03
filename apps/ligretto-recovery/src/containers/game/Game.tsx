import React from 'react'
import { useSelector } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import { selectOpponents } from 'ducks/game'
import type { PositionOnTable } from '@memebattle/ligretto-ui'
import { isMultiplyRenderChildren, RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { TableCards, CardsPanel } from 'components/blocks/game'

const createRenderChildren = (opponents: Player[]) => {
  const renderChild = opponents.map(opponent => (positionOnTable: PositionOnTable) => (
    <OpponentCards key={positionOnTable} positionOnTable={positionOnTable} cards={opponent.cards} stackOpenDeckCards={opponent.stackOpenDeck.cards} />
  ))

  if (isMultiplyRenderChildren(renderChild)) {
    return renderChild
  } else {
    return null
  }
}

export const Game = () => {
  const opponents = useSelector(selectOpponents)

  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])

  return (
    <>
      {renderChildren ? <RoomGrid renderChildren={renderChildren} /> : null}
      <TableCards />
      <CardsPanel />
    </>
  )
}
