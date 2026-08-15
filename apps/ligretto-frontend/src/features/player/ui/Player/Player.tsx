import React from 'react'
import History from '@mui/icons-material/History'
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined'
import WifiOff from '@mui/icons-material/WifiOff'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { styled } from '@mui/material/styles'

import { Avatar } from '#shared/ui/Avatar'

import { useMediaQuery, useTheme } from '@memebattle/ui'

interface CalcPlayerHeightParams {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const calcPlayerHeight = ({ status, isActivePlayer }: CalcPlayerHeightParams): string => {
  switch (true) {
    case isActivePlayer && status === PlayerStatus.InGame:
      return '9rem'
    case isActivePlayer:
      return '12rem'
    case !isActivePlayer && status === PlayerStatus.InGame:
      return '3rem'
    case !isActivePlayer:
      return '10rem'
  }
  return '10rem'
}

interface StyledPlayerProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const StyledPlayer = styled('div')<StyledPlayerProps>(({ status, isActivePlayer, theme }) => ({
  display: 'flex',
  flexDirection: status === PlayerStatus.InGame && !isActivePlayer ? 'row' : 'column',
  height: calcPlayerHeight({ isActivePlayer, status }),
  [theme.breakpoints.down('sm')]: {
    maxWidth: '1.5rem',
    maxHeight: '1.5rem',
  },
  width: isActivePlayer ? '12rem' : '10rem',
  alignItems: 'center',
  opacity: status === PlayerStatus.DontReadyToPlay ? 0.5 : 1,
  transition: 'opacity 100ms',
  justifyContent: 'end',
}))

const StyledIconWrapper = styled('div')(() => ({
  marginLeft: '0.5rem',
  fontSize: '2rem',
  width: '2rem',
  height: '2rem',
  lineHeight: '1',
}))

const AvatarWrapper = styled('div')(() => ({
  position: 'relative',
  display: 'flex',
  height: '100%',
  maxWidth: '100%',
  aspectRatio: '1',
}))

const DisconnectedAvatar = styled('div')(() => ({
  display: 'flex',
  width: '100%',
  height: '100%',
  filter: 'grayscale(1)',
  opacity: 0.5,
  transition: 'filter 150ms, opacity 150ms',
}))

const ConnectionIconWrapper = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  right: 0,
  display: 'flex',
  fontSize: '0.75rem',
  padding: '0.125rem',
  borderRadius: '50%',
  color: theme.palette.error.main,
  background: theme.palette.background.paper,
}))

interface UsernameProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const Username = styled('span')<UsernameProps>(({ status, isActivePlayer }) => ({
  color: '#fff',
  fontSize: status === PlayerStatus.InGame && !isActivePlayer ? '1rem' : '1.5rem',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  width: '100%',
  whiteSpace: 'nowrap',
}))

interface BottomProps {
  status: PlayerStatus
  isActivePlayer?: boolean
  isDisconnected?: boolean
}

const Bottom = styled('div')<BottomProps>(({ theme, status, isActivePlayer, isDisconnected }) => ({
  borderRadius: 4,
  background: theme.palette.background.paper,
  alignItems: 'center',
  display: 'flex',
  padding: '0.5rem',
  maxWidth: '100%',
  width: '100%',
  marginLeft: status === PlayerStatus.InGame && !isActivePlayer ? '0.75rem' : 0,
  filter: isDisconnected ? 'grayscale(1)' : 'none',
  opacity: isDisconnected ? 0.5 : 1,
  transition: 'filter 150ms, opacity 150ms',
  [theme.breakpoints.down('sm')]: {
    display: 'none',
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
  [PlayerStatus.Disconnected]: null,
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
  const layoutStatus = isDisconnected ? PlayerStatus.InGame : status

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile && isActivePlayer) {
    return null
  }

  const Icon = IconByStatus[status]

  return (
    <StyledPlayer status={layoutStatus} isActivePlayer={isActivePlayer}>
      {isDisconnected ? (
        <AvatarWrapper>
          <DisconnectedAvatar>
            <Avatar src={avatar} alt={username} size="auto" />
          </DisconnectedAvatar>
          <ConnectionIconWrapper>
            <WifiOff fontSize="inherit" titleAccess="Connection lost" />
          </ConnectionIconWrapper>
        </AvatarWrapper>
      ) : (
        <Avatar src={avatar} alt={username} size="auto" />
      )}
      <Bottom
        isActivePlayer={isActivePlayer}
        status={layoutStatus}
        isDisconnected={isDisconnected}
        title={`${username} (${TitlePostfixByStatus[status]})`}
      >
        <Username isActivePlayer={isActivePlayer} status={layoutStatus}>
          {username}
        </Username>
        {Icon ? (
          <StyledIconWrapper>
            <Icon fontSize="inherit" />
          </StyledIconWrapper>
        ) : null}
      </Bottom>
    </StyledPlayer>
  )
}

Player.displayName = 'Player'
