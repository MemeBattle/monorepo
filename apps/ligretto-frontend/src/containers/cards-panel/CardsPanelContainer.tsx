import React, { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from 'reselect'

import { CardsPanel } from 'components/blocks/game'
import { tapLigrettoDeckCardAction, selectPlayerLigrettoDeckCards, selectActivePlayer } from 'ducks/game'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

const CardsPanelContainerSelector = createSelector([selectPlayerLigrettoDeckCards], playerLigrettoDeckCards => ({
  playerLigrettoDeckCards,
}))

export const CardsPanelContainer = () => {
  const dispatch = useDispatch()
  const player = useSelector(selectActivePlayer)
  const { playerLigrettoDeckCards } = useSelector(CardsPanelContainerSelector)
  const playerWithStaticAvatar = useMemo(() => {
    if (player) {
      const avatar = player?.avatar ? buildCasStaticUrl(player.avatar) : undefined
      return { ...player, avatar }
    }
  }, [player])
  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])
  return <CardsPanel ligrettoDeckCards={playerLigrettoDeckCards} onLigrettoDeckCardClick={onLigrettoDeckCardClick} player={playerWithStaticAvatar} />
}
