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

const StyledPlayer = styled('div')<{ status: PlayerStatus; isActivePlayer?: boolean }>(({ status, isActivePlayer, theme }) => ({
  display: 'flex',
  flexDirection: status === PlayerStatus.InGame && !isActivePlayer ? 'row' : 'column',
  maxWidth: '12rem',
  [theme.breakpoints.down('sm')]: {
    maxWidth: '1.5rem',
  },
  alignItems: 'center',
  opacity: status === PlayerStatus.DontReadyToPlay ? 0.5 : 1,
  transition: 'opacity 100ms',
  justifyContent: 'end',
}))

const StyledIconWrapper = styled('div')(() => ({
  marginLeft: 'auto',
  fontSize: '2rem',
  width: '2rem',
  height: '2rem',
  lineHeight: '1',
}))

const Username = styled('span')<{ status: PlayerStatus }>(({ status }) => ({
  color: '#fff',
  fontSize: '1.5rem',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  marginRight: status === PlayerStatus.InGame ? 0 : '0.5rem',
  width: '100%',
}))

const Bottom = styled('div')<{ status: PlayerStatus }>(({ theme, status }) => ({
  borderRadius: 4,
  background: theme.palette.primary.main,
  alignItems: 'center',
  display: 'flex',
  padding: '0.5rem',
  maxWidth: '100%',
  width: '100%',
  marginLeft: status === PlayerStatus.InGame ? '0.75rem' : 0,
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
      <Bottom status={status}>
        <Username status={status} title={username}>
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
