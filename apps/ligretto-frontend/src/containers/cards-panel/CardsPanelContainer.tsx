import React, { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'

import { CardsPanel } from 'components/blocks/game'
import { tapLigrettoDeckCardAction, playerLigrettoDeckCardsSelector, activePlayerSelector } from 'ducks/game'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

const cardsPanelContainerSelector = createSelector(
  [activePlayerSelector, playerLigrettoDeckCardsSelector],
  (activePlayer, playerLigrettoDeckCards) => ({
    player: activePlayer,
    playerLigrettoDeckCards,
  }),
)

export const CardsPanelContainer = () => {
  const dispatch = useDispatch()

  const { player, playerLigrettoDeckCards } = useSelector(cardsPanelContainerSelector)

  const playerWithStaticAvatar = useMemo(() => {
    if (player) {
      const avatar = player?.avatar ? buildCasStaticUrl(player.avatar) : undefined
      return { ...player, avatar }
    }
  }, [player])

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  if (!playerLigrettoDeckCards) {
    return null
  }

  return <CardsPanel ligrettoDeckCards={playerLigrettoDeckCards} onLigrettoDeckCardClick={onLigrettoDeckCardClick} player={playerWithStaticAvatar} />
}
