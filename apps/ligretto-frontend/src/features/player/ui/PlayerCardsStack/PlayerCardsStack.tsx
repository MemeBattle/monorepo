import CachedIcon from '@mui/icons-material/Cached'
import { styled } from '@mui/material/styles'
import React from 'react'
import { useSelector } from 'react-redux'

import { Hotkey } from '#ducks/game'
import { CardHotkeyBadge, CardPlace } from '#entities/card'
import { CardsRow } from '#entities/card/ui/CardsRow'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'
import { PlayerStackDeck } from './PlayerStackDeck'
import { PlayerStackOpenCard } from './PlayerStackOpenCard'

const ReshuffleHint = styled('div')(({ theme }) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  pointerEvents: 'none',
  fontSize: '3rem',
  [theme.breakpoints.down('sm')]: {
    fontSize: '2rem',
  },
}))

export const PlayerCardsStack = () => {
  const { stackDeckCards, stackOpenDeckCard } = useSelector(playerCardsStackSelector)

  if (!stackDeckCards) {
    return null
  }

  const isStackDeckEnabled = stackDeckCards.length > 0 || !!stackOpenDeckCard

  return (
    <CardsRow>
      <CardPlace>
        {stackOpenDeckCard && (
          <CardHotkeyBadge hotkey={Hotkey.x}>
            <PlayerStackOpenCard card={stackOpenDeckCard} />
          </CardHotkeyBadge>
        )}
      </CardPlace>

      <CardHotkeyBadge hotkey={isStackDeckEnabled ? Hotkey.space : undefined}>
        <CardPlace>
          <PlayerStackDeck />
          {stackDeckCards.length === 0 && stackOpenDeckCard ? (
            <ReshuffleHint>
              <CachedIcon fontSize="inherit" />
            </ReshuffleHint>
          ) : null}
        </CardPlace>
      </CardHotkeyBadge>
    </CardsRow>
  )
}
