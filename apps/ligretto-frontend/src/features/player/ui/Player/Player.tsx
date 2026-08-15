import React from 'react'
import History from '@mui/icons-material/History'
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined'
import WifiOff from '@mui/icons-material/WifiOff'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { styled } from '@mui/material/styles'

import { Avatar } from '#shared/ui/Avatar'

import { useMediaQuery, useTheme } from '@memebattle/ui'

const usesCompactLayout = (status: PlayerStatus): boolean => status === PlayerStatus.InGame || status === PlayerStatus.Disconnected

const getPlayerHeight = (status: PlayerStatus, isActivePlayer?: boolean): string => {
  if (usesCompactLayout(status)) {
    return isActivePlayer ? '9rem' : '3rem'
  }

  return isActivePlayer ? '12rem' : '10rem'
}

interface StyledPlayerProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const StyledPlayer = styled('div')<StyledPlayerProps>(({ status, isActivePlayer, theme }) => ({
  display: 'flex',
  flexDirection: usesCompactLayout(status) && !isActivePlayer ? 'row' : 'column',
  height: getPlayerHeight(status, isActivePlayer),
  width: isActivePlayer ? '12rem' : '10rem',
  alignItems: 'center',
  opacity: status === PlayerStatus.DontReadyToPlay ? 0.5 : 1,
  transition: 'opacity 100ms',
  justifyContent: 'end',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'row',
    width: 'auto',
    maxWidth: '8rem',
    height: '1.5rem',
    maxHeight: '1.5rem',
    justifyContent: 'start',
  },
}))

interface StyledIconWrapperProps {
  status: PlayerStatus
}

const StyledIconWrapper = styled('div')<StyledIconWrapperProps>(({ status, theme }) => ({
  marginLeft: usesCompactLayout(status) ? '0.25rem' : '0.5rem',
  fontSize: usesCompactLayout(status) ? '1rem' : '2rem',
  width: usesCompactLayout(status) ? '1rem' : '2rem',
  height: usesCompactLayout(status) ? '1rem' : '2rem',
  lineHeight: '1',
  color: status === PlayerStatus.Disconnected ? theme.palette.error.main : 'inherit',
  [theme.breakpoints.down('sm')]: {
    marginLeft: '0.125rem',
    fontSize: '0.75rem',
    width: '0.75rem',
    height: '0.75rem',
  },
}))

interface DisconnectedAvatarProps {
  isActivePlayer?: boolean
}

const DisconnectedAvatar = styled('div')<DisconnectedAvatarProps>(({ isActivePlayer }) => ({
  display: 'flex',
  height: '100%',
  maxWidth: '100%',
  aspectRatio: '1',
  flexShrink: isActivePlayer ? 1 : 0,
  filter: 'grayscale(1)',
  opacity: 0.5,
  transition: 'filter 150ms, opacity 150ms',
}))

interface UsernameProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const Username = styled('span')<UsernameProps>(({ status, isActivePlayer, theme }) => ({
  color: '#fff',
  fontSize: usesCompactLayout(status) && !isActivePlayer ? '0.75rem' : '1.5rem',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  width: '100%',
  whiteSpace: 'nowrap',
  filter: status === PlayerStatus.Disconnected ? 'grayscale(1)' : 'none',
  opacity: status === PlayerStatus.Disconnected ? 0.5 : 1,
  transition: 'filter 150ms, opacity 150ms',
  [theme.breakpoints.down('sm')]: {
    fontSize: '0.625rem',
  },
}))

interface BottomProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const Bottom = styled('div')<BottomProps>(({ theme, status, isActivePlayer }) => ({
  borderRadius: 4,
  background: theme.palette.background.paper,
  alignItems: 'center',
  display: 'flex',
  padding: '0.5rem',
  minWidth: 0,
  maxWidth: '100%',
  width: '100%',
  marginLeft: usesCompactLayout(status) && !isActivePlayer ? '0.75rem' : 0,
  [theme.breakpoints.down('sm')]: {
    display: 'flex',
    width: 'auto',
    maxWidth: '5rem',
    minWidth: 0,
    height: '100%',
    marginLeft: '0.25rem',
    padding: '0.125rem 0.25rem',
  },
}))

export interface PlayerProps {
  username: string
  avatar?: string
  status: PlayerStatus
  isActivePlayer?: boolean
}

const IconByStatus = {
  [PlayerStatus.ReadyToPlay]: CheckCircleOutlineOutlined,
  [PlayerStatus.DontReadyToPlay]: History,
  [PlayerStatus.InGame]: null,
  [PlayerStatus.Disconnected]: WifiOff,
}

const TitlePostfixByStatus = {
  [PlayerStatus.ReadyToPlay]: 'ready',
  [PlayerStatus.DontReadyToPlay]: 'not ready',
  [PlayerStatus.InGame]: 'playing',
  [PlayerStatus.Disconnected]: 'disconnected',
}

export const Player: React.FC<PlayerProps> = props => {
  const { avatar, username, status, isActivePlayer } = props
  const isDisconnected = status === PlayerStatus.Disconnected

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile && isActivePlayer) {
    return null
  }

  const Icon = IconByStatus[status]

  return (
    <StyledPlayer status={status} isActivePlayer={isActivePlayer}>
      {isDisconnected ? (
        <DisconnectedAvatar isActivePlayer={isActivePlayer}>
          <Avatar src={avatar} alt={username} size="auto" />
        </DisconnectedAvatar>
      ) : (
        <Avatar src={avatar} alt={username} size="auto" />
      )}
      <Bottom isActivePlayer={isActivePlayer} status={status} title={`${username} (${TitlePostfixByStatus[status]})`}>
        <Username isActivePlayer={isActivePlayer} status={status}>
          {username}
        </Username>
        {Icon ? (
          <StyledIconWrapper status={status}>
            <Icon fontSize="inherit" titleAccess={isDisconnected ? 'Connection lost' : undefined} />
          </StyledIconWrapper>
        ) : null}
      </Bottom>
    </StyledPlayer>
  )
}

Player.displayName = 'Player'
