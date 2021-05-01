import React from 'react'
import { useSelector } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import { selectPlaygroundDecks, selectOpponents } from 'ducks/game'
import type { PositionOnTable } from '@memebattle/ligretto-ui'
import { isMultiplyRenderChildren, RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { Playground } from 'components/blocks/game'
import { CardsPanelContainer } from '../cards-panel'
import { createSelector } from 'reselect'

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

const GameSelector = createSelector([selectOpponents, selectPlaygroundDecks], (opponents, cardsDecks) => ({
  opponents,
  cardsDecks,
}))

export const Game = () => {
  const { opponents, cardsDecks } = useSelector(GameSelector)
  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])

  return (
    <>
      {renderChildren ? <RoomGrid renderChildren={renderChildren} /> : null}
      <Playground cardsDecks={cardsDecks} />
      <CardsPanelContainer />
    </>
  )
}
