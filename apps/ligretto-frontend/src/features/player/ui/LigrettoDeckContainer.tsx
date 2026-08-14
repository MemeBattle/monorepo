import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Hotkey, tapLigrettoDeckCardAction, playerLigrettoDeckCardsSelector, playerLigrettoDeckHiddenSelector } from '#ducks/game'
import { CardHotkeyBadge } from '#entities/card'
import { LigrettoPack } from './LigrettoPack'
import { useCardHotkey } from '../lib/useCardHotkey'

export const LigrettoDeckContainer = () => {
  const dispatch = useDispatch()
  const ligrettoDeckCards = useSelector(playerLigrettoDeckCardsSelector)
  const isDeckHidden = useSelector(playerLigrettoDeckHiddenSelector)
  const isLigrettoDeckEnabled = !!ligrettoDeckCards?.length

  const onLigrettoDeckCardClick = useCallback(() => {
    if (isLigrettoDeckEnabled) {
      dispatch(tapLigrettoDeckCardAction())
    }
  }, [dispatch, isLigrettoDeckEnabled])

  useCardHotkey(Hotkey.l, onLigrettoDeckCardClick, isLigrettoDeckEnabled)

  if (!ligrettoDeckCards) {
    return null
  }

  return (
    <CardHotkeyBadge hotkey={isLigrettoDeckEnabled ? Hotkey.l : undefined}>
      <LigrettoPack
        count={ligrettoDeckCards.length}
        ligrettoDeckCards={ligrettoDeckCards}
        isDeckHidden={isDeckHidden ?? true}
        onLigrettoDeckCardClick={onLigrettoDeckCardClick}
      />
    </CardHotkeyBadge>
  )
}
