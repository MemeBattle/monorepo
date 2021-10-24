import React from 'react'
import { useSelector } from 'react-redux'
import { selectOpponents } from 'ducks/game'
import { RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { CardsPanelContainer } from '../cards-panel'
import { createSelector } from 'reselect'
import { PlaygroundContainer } from '../playground'

const GameSelector = createSelector([selectOpponents], opponents => ({
  opponents,
}))

export const Game = () => {
  const { opponents } = useSelector(GameSelector)

  return (
    <>
      <RoomGrid>
        {opponents.map(opponent => (
          <OpponentCards key={opponent.id} cards={opponent.cards} stackOpenDeckCards={opponent.stackOpenDeck.cards} />
        ))}
      </RoomGrid>
      <PlaygroundContainer />
      <CardsPanelContainer />
    </>
  )
}
