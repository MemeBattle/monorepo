import React, { useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import {
  selectOpponents,
  tapCardAction,
  selectPlayerCards,
  selectPlayerStackOpenDeckCards,
  tapStackOpenDeckCardAction,
  tapStackDeckCardAction,
  selectPlayerStackDeckCards,
  tapLigrettoDeckCardAction,
  selectPlayerLigrettoDeckCards,
} from 'ducks/game'
import type { PositionOnTable, RenderChildren } from '@memebattle/ligretto-ui'
import { isMultiplyRenderChildren, RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { TableCards, CardsPanel } from 'components/blocks/game'
import { createSelector } from 'reselect'

const renderOpponent: RenderChildren = (positionOnTable: PositionOnTable) => <OpponentCards key={positionOnTable} positionOnTable={positionOnTable} />

const createRenderChildren = (opponents: Player[]) => {
  const renderChild = opponents.map<RenderChildren>(() => renderOpponent)
  if (isMultiplyRenderChildren(renderChild)) {
    return renderChild
  } else {
    return null
  }
}

const GameSelector = createSelector(
  [selectOpponents, selectPlayerCards, selectPlayerStackOpenDeckCards, selectPlayerStackDeckCards, selectPlayerLigrettoDeckCards],
  (opponents, playerCards, playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards) => ({
    opponents,
    playerCards,
    playerStackOpenDeckCards,
    playerStackDeckCards,
    playerLigrettoDeckCards,
  }),
)

export const Game = () => {
  const dispatch = useDispatch()
  const { opponents, playerCards, playerStackOpenDeckCards, playerStackDeckCards, playerLigrettoDeckCards } = useSelector(GameSelector)
  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])

  const handleCardRowClick = (index: number) => {
    dispatch(tapCardAction({ cardIndex: index }))
  }

  const handleStackOpenDeckCardClick = () => {
    dispatch(tapStackOpenDeckCardAction())
  }

  const handleStackDeckCardClick = () => {
    dispatch(tapStackDeckCardAction())
  }

  const handleLigrettoDeckCardClick = () => {
    dispatch(tapLigrettoDeckCardAction())
  }

  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      playerCards[i] ? newPlayerCardsArr.push(playerCards[i]) : newPlayerCardsArr.push({})
    }

    return newPlayerCardsArr
  }, [playerCards])

  return (
    <>
      {renderChildren ? <RoomGrid renderChildren={renderChildren} /> : null}
      <TableCards />
      <CardsPanel
        cards={cards}
        stackOpenDeckCards={playerStackOpenDeckCards}
        stackDeckCards={playerStackDeckCards}
        ligrettoDeckCards={playerLigrettoDeckCards}
        handleCardRowClick={handleCardRowClick}
        handleStackOpenDeckCardClick={handleStackOpenDeckCardClick}
        handleStackDeckCardClick={handleStackDeckCardClick}
        handleLigrettoDeckCardClick={handleLigrettoDeckCardClick}
      />
    </>
  )
}
