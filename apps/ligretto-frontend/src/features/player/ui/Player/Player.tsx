import React from 'react'
import History from '@mui/icons-material/History'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { styled } from '@mui/material/styles'

import { Avatar } from 'shared/ui/Avatar'

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
}

const Bottom = styled('div')<BottomProps>(({ theme, status, isActivePlayer }) => ({
  borderRadius: 4,
  background: theme.palette.background.paper,
  alignItems: 'center',
  display: 'flex',
  padding: '0.5rem',
  maxWidth: '100%',
  width: '100%',
  marginLeft: status === PlayerStatus.InGame && !isActivePlayer ? '0.75rem' : 0,
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
  [PlayerStatus.ReadyToPlay]: CheckCircleOutline,
  [PlayerStatus.DontReadyToPlay]: History,
  [PlayerStatus.InGame]: null,
}

const TitlePostfixByStatus = {
  [PlayerStatus.ReadyToPlay]: 'ready',
  [PlayerStatus.DontReadyToPlay]: 'not ready',
  [PlayerStatus.InGame]: 'playing',
}

export const Player: React.FC<PlayerProps> = props => {
  const { avatar, username, status, isActivePlayer } = props

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile && isActivePlayer) {
    return null
  }

  const Icon = IconByStatus[status]

  return (
    <StyledPlayer status={status} isActivePlayer={isActivePlayer}>
      <Avatar src={avatar} alt={username} size="auto" />
      <Bottom isActivePlayer={isActivePlayer} status={status} title={`${username} (${TitlePostfixByStatus[status]})`}>
        <Username isActivePlayer={isActivePlayer} status={status}>
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
