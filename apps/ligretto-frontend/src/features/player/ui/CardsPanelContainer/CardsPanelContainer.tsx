import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'

import { activePlayerSelector, isDndEnabledSelector } from '#ducks/game'
import { buildCasStaticUrl } from '#shared/api/buildCasStaticUrl'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

import { CardsPanel } from '../CardsPanel'

import { PlayerStatus } from '@memebattle/ligretto-shared'
import { LigrettoDeckContainer } from '../LigrettoDeckContainer'
import { PlayerCardsStack } from '../PlayerCardsStack'
import { PlayerRowCardsContainer } from '../PlayerRowCardsContainer'
import { usePanelHotkeys } from './usePanelHotkeys'

const cardsPanelContainerSelector = createSelector([activePlayerSelector, isDndEnabledSelector], (activePlayer, isDndEnabled) => ({
  player: activePlayer,
  isDndEnabled,
}))

export const CardsPanelContainer = () => {
  const { player, isDndEnabled } = useSelector(cardsPanelContainerSelector)
  const isInGame = player?.status === PlayerStatus.InGame

  usePanelHotkeys({ enabled: isDndEnabled && isInGame })

  const playerWithStaticAvatar = useMemo(() => {
    if (player) {
      const avatar = player?.avatar ? buildCasStaticUrl(player.avatar) : getRandomAvatar(player.id)
      return { ...player, avatar }
    }
  }, [player])

  return (
    <CardsPanel
      player={playerWithStaticAvatar}
      stack={isInGame ? <PlayerCardsStack /> : null}
      rowCards={isInGame ? <PlayerRowCardsContainer /> : null}
      ligretto={isInGame ? <LigrettoDeckContainer /> : null}
    />
  )
}
