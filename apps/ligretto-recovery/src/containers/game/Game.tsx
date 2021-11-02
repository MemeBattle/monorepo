import React from 'react'
import { useSelector } from 'react-redux'
import { selectOpponents } from 'ducks/game'
import { RoomGrid } from '@memebattle/ligretto-ui'
import { Opponent } from 'components/blocks/game/opponent'
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
          <Opponent
            avatar={opponent.avatar}
            status={opponent.status}
            username={opponent.username}
            key={opponent.id}
            cards={opponent.cards}
            stackOpenDeckCards={opponent.stackOpenDeck.cards}
          />
        ))}
      </RoomGrid>
      <PlaygroundContainer />
      <CardsPanelContainer />
    </>
  )
}
