import React from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'

import { activePlayerSelector } from '#ducks/game'

import { CardsPanel } from '../CardsPanel'

import { PlayerStatus } from '@memebattle/ligretto-shared'
import { LigrettoDeckContainer } from '../LigrettoDeckContainer'
import { PlayerCardsStack } from '../PlayerCardsStack'
import { PlayerRowCardsContainer } from '../PlayerRowCardsContainer'

const cardsPanelContainerSelector = createSelector([activePlayerSelector], activePlayer => ({ player: activePlayer }))

export const CardsPanelContainer = () => {
  const { player } = useSelector(cardsPanelContainerSelector)
  const isInGame = player?.status === PlayerStatus.InGame

  return (
    <CardsPanel
      player={player}
      stack={isInGame ? <PlayerCardsStack /> : null}
      rowCards={isInGame ? <PlayerRowCardsContainer /> : null}
      ligretto={isInGame ? <LigrettoDeckContainer /> : null}
    />
  )
}
