import React from 'react'
import History from '@mui/icons-material/History'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { Avatar } from 'components/Avatar'
import { styled } from '@mui/material/styles'

export interface PlayerProps {
  username: string
  avatar?: string
  status: PlayerStatus
  isActivePlayer?: boolean
}

const calcPlayerHeight = ({ status, isActivePlayer }: { status: PlayerStatus; isActivePlayer?: boolean }): string => {
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

const StyledPlayer = styled('div')<{ status: PlayerStatus; isActivePlayer?: boolean }>(({ status, isActivePlayer, theme }) => ({
  display: 'flex',
  flexDirection: status === PlayerStatus.InGame && !isActivePlayer ? 'row' : 'column',
  maxWidth: '12rem',
  [theme.breakpoints.down('sm')]: {
    maxWidth: '1.5rem',
  },
  height: calcPlayerHeight({ isActivePlayer, status }),
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

const Username = styled('span')<{ status: PlayerStatus; isActivePlayer?: boolean }>(({ status, isActivePlayer }) => ({
  color: '#fff',
  fontSize: status === PlayerStatus.InGame && !isActivePlayer ? '1rem' : '1.5rem',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  width: '100%',
}))

const Bottom = styled('div')<{ status: PlayerStatus; isActivePlayer?: boolean }>(({ theme, status, isActivePlayer }) => ({
  borderRadius: 4,
  background: theme.palette.primary.main,
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

const IconByStatus = {
  [PlayerStatus.ReadyToPlay]: CheckCircleOutline,
  [PlayerStatus.DontReadyToPlay]: History,
  [PlayerStatus.InGame]: null,
}

export const Player: React.FC<PlayerProps> = props => {
  const { avatar, username, status, isActivePlayer } = props

  const Icon = IconByStatus[status]

  return (
    <StyledPlayer status={status} isActivePlayer={isActivePlayer}>
      <Avatar src={avatar} alt={username} size="auto" />
      <Bottom isActivePlayer={isActivePlayer} status={status}>
        <Username isActivePlayer={isActivePlayer} status={status} title={username}>
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
