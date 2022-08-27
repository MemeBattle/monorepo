import React from 'react'
import { Badge } from '@mui/material'
import { styled } from '@mui/material/styles'

interface CardHotkeyBadgeProps {
  hotkey?: string
}

const StyledCardHotkeyBadge = styled(Badge)(() => ({
  '.MuiBadge-badge': {
    opacity: 0.9,
    borderRadius: '4px',
  },
  '.MuiBadge-anchorOriginBottomRight': {
    right: '50%',
  },
}))

export const CardHotkeyBadge: React.FC<CardHotkeyBadgeProps> = ({ hotkey, children }) => (
  <StyledCardHotkeyBadge
    anchorOrigin={{
      vertical: 'bottom',
      horizontal: 'right',
    }}
    badgeContent={hotkey?.toUpperCase()}
    color="info"
  >
    {children}
  </StyledCardHotkeyBadge>
)
