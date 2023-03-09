import React from 'react'
import { useSelector } from 'react-redux'
import { RoomGrid } from 'components/blocks/game/RoomGrid'
import { createSelector } from '@reduxjs/toolkit'

import { opponentsSelector } from 'ducks/game'
import { Opponent } from 'components/blocks/game/opponent'

import { CardsPanelContainer } from '../CardsPanelContainer'
import { PlaygroundContainer } from '../playground'

const GameSelector = createSelector([opponentsSelector], opponents => ({
  opponents,
}))

export const GameContainer = () => {
  const { opponents } = useSelector(GameSelector)

  return (
    <RoomGrid centerElement={<PlaygroundContainer />} bottomElement={<CardsPanelContainer />}>
      {opponents.map(opponent => (
        <Opponent
          id={opponent.id}
          avatar={opponent.avatar}
          status={opponent.status}
          username={opponent.username}
          key={opponent.id}
          cards={opponent.cards}
          stackOpenDeckCards={opponent.stackOpenDeck.cards}
        />
      ))}
    </RoomGrid>
  )
}
