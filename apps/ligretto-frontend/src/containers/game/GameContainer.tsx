import React from 'react'
import { useSelector } from 'react-redux'
import { RoomGrid } from '@memebattle/ui'
import { createSelector } from 'reselect'

import { selectOpponents } from 'ducks/game'
import { Opponent } from 'components/blocks/game/opponent'

import { CardsPanelContainer } from '../cards-panel'
import { PlaygroundContainer } from '../playground'

const GameSelector = createSelector([selectOpponents], opponents => ({
  opponents,
}))

export const GameContainer = () => {
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
