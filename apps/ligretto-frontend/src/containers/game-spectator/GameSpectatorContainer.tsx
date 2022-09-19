import React from 'react'
import { useSelector } from 'react-redux'
import { RoomGrid } from '@memebattle/ui'
import { createSelector } from 'reselect'

import { opponentsSelector } from 'ducks/game'
import { Opponent } from 'components/blocks/game/opponent'

import { PlaygroundContainer } from '../playground'

const GameSpectatorContainerSelector = createSelector([opponentsSelector], opponents => ({
  opponents,
}))

export const GameSpectatorContainer = () => {
  const { opponents } = useSelector(GameSpectatorContainerSelector)

  return (
    <>
      <RoomGrid>
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
      <PlaygroundContainer />
    </>
  )
}
