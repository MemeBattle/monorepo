import type { FC } from 'react'
import type { SvgIconComponent } from '@mui/icons-material'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import { Box, Typography } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'
import { PlayerStatus } from '@memebattle/ligretto-shared'

const statusView: Record<PlayerStatus, { label: string; color: string; Icon: SvgIconComponent }> = {
  [PlayerStatus.ReadyToPlay]: { label: 'Ready', color: 'primary.light', Icon: CheckRoundedIcon },
  [PlayerStatus.DontReadyToPlay]: { label: 'Not ready', color: 'warning.main', Icon: ScheduleOutlinedIcon },
  [PlayerStatus.InGame]: { label: 'In game', color: 'text.primary', Icon: SportsEsportsOutlinedIcon },
  [PlayerStatus.Disconnected]: { label: 'Offline', color: 'error.light', Icon: WifiOffIcon },
}

interface PlayerStatusPillProps {
  status: PlayerStatus
  /** Shows the icon alone, with the label kept for assistive technology and the tooltip. */
  isCompact?: boolean
}

export const PlayerStatusPill: FC<PlayerStatusPillProps> = ({ status, isCompact }) => {
  const { label, color, Icon } = statusView[status]

  return (
    <Box
      display="inline-flex"
      alignItems="center"
      title={isCompact ? label : undefined}
      role={isCompact ? 'img' : undefined}
      aria-label={isCompact ? label : undefined}
      sx={{
        gap: 0.75,
        px: isCompact ? 0.75 : 1.25,
        py: 0.5,
        borderRadius: 999,
        color,
        bgcolor: theme => alpha(theme.palette.common.black, 0.25),
      }}
    >
      <Icon sx={{ fontSize: '1rem' }} />
      {!isCompact && (
        <Typography variant="body2" fontWeight={600} noWrap>
          {label}
        </Typography>
      )}
    </Box>
  )
}

PlayerStatusPill.displayName = 'PlayerStatusPill'
