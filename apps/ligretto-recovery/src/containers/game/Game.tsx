import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import { selectDeskCards, selectOpponents } from 'ducks/game'
import type { PositionOnTable } from '@memebattle/ligretto-ui'
import { isMultiplyRenderChildren, RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { TableCards } from 'components/blocks/game'
import { CardsPanelContainer } from '../cards-panel'
import { CardColors } from '@memebattle/ligretto-shared'
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

const GameSelector = createSelector([selectOpponents, selectDeskCards], (opponents, deskCards) => ({
  opponents,
  deskCards,
}))

export const Game = () => {
  const { opponents, deskCards } = useSelector(GameSelector)
  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])
  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      deskCards[i] ? newPlayerCardsArr.push(deskCards[i].cards[deskCards[i].cards.length - 1]) : newPlayerCardsArr.push({ color: CardColors.empty })
    }

    return newPlayerCardsArr
  }, [deskCards])

  return (
    <>
      {renderChildren ? <RoomGrid renderChildren={renderChildren} /> : null}
      <TableCards cards={cards} />
      <CardsPanelContainer />
    </>
  )
}
