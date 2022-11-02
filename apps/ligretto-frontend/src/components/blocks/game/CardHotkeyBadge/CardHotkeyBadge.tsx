import React from 'react'
import Badge from '@mui/material/Badge'
import { styled } from '@mui/material/styles'

interface CardHotkeyBadgeProps {
  hotkey?: string
}

const StyledCardHotkeyBadge = styled(Badge)(({ theme }) => ({
  '.MuiBadge-badge': {
    opacity: 0.9,
    borderRadius: '4px',
    backgroundColor: theme.palette.grey[400],
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
  >
    {children}
  </StyledCardHotkeyBadge>
)
