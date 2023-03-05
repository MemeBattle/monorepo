import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'

import { CardsPanel } from 'components/blocks/game/CardsPanel'
import { playerLigrettoDeckCardsSelector, activePlayerSelector, isDndEnabledSelector } from 'ducks/game'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { usePanelHotkeys } from './usePanelHotkeys'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

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
