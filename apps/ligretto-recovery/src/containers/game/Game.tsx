import React from 'react'
import { useSelector } from 'react-redux'
import { selectPlaygroundDecks, selectOpponents } from 'ducks/game'
import { RoomGrid } from '@memebattle/ligretto-ui'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { Playground } from 'components/blocks/game'
import { CardsPanelContainer } from '../cards-panel'
import { createSelector } from 'reselect'

const GameSelector = createSelector([selectOpponents, selectPlaygroundDecks], (opponents, cardsDecks) => ({
  opponents,
  cardsDecks,
}))

export const Game = () => {
  const { opponents, cardsDecks } = useSelector(GameSelector)

  return (
    <>
      <RoomGrid>
        {opponents.map(opponent => (
          <OpponentCards key={opponent.id} cards={opponent.cards} stackOpenDeckCards={opponent.stackOpenDeck.cards} />
        ))}
      </RoomGrid>
      <Playground cardsDecks={cardsDecks} />
      <CardsPanelContainer />
    </>
  )
}
