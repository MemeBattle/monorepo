import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'

import { playerLigrettoDeckCardsSelector, activePlayerSelector, isDndEnabledSelector } from 'ducks/game'
import { buildCasStaticUrl } from 'shared/api/buildCasStaticUrl'
import { getRandomAvatar } from 'shared/ui/Avatar/getRandomAvatar'

import { CardsPanel } from '../CardsPanel'

import { usePanelHotkeys } from './usePanelHotkeys'

const cardsPanelContainerSelector = createSelector(
  [activePlayerSelector, playerLigrettoDeckCardsSelector, isDndEnabledSelector],
  (activePlayer, playerLigrettoDeckCards, isDndEnabled) => ({
    player: activePlayer,
    playerLigrettoDeckCards,
    isDndEnabled,
  }),
)

export const CardsPanelContainer = () => {
  const { player, isDndEnabled } = useSelector(cardsPanelContainerSelector)

  usePanelHotkeys({ enabled: isDndEnabled })

  const playerWithStaticAvatar = useMemo(() => {
    if (player) {
      const avatar = player?.avatar ? buildCasStaticUrl(player.avatar) : getRandomAvatar(player.id)
      return { ...player, avatar }
    }
  }, [player])

  return <CardsPanel player={playerWithStaticAvatar} />
}
