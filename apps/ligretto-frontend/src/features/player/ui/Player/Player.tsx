import React from 'react'
import History from '@mui/icons-material/History'
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined'
import WifiOff from '@mui/icons-material/WifiOff'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { styled } from '@mui/material/styles'

import { Avatar } from '#shared/ui/Avatar'
import { tabletHeightBySize, mobileHeightBySize } from '#entities/card'

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
  // On mobile and tablet the block matches the height of the cards next to it:
  // small cards for opponents, large ones for the active player
  [theme.breakpoints.down('md')]: isActivePlayer
    ? {
        height: tabletHeightBySize.large,
        maxHeight: tabletHeightBySize.large,
      }
    : {
        flexDirection: 'column',
        width: '3.5rem',
        maxWidth: '3.5rem',
        height: tabletHeightBySize.small,
        maxHeight: tabletHeightBySize.small,
      },
  [theme.breakpoints.down('sm')]: isActivePlayer
    ? {
        height: mobileHeightBySize.large,
        maxHeight: mobileHeightBySize.large,
      }
    : {
        height: mobileHeightBySize.small,
        maxHeight: mobileHeightBySize.small,
      },
}))

interface StyledIconWrapperProps {
  status: PlayerStatus
  isActivePlayer?: boolean
}

const StyledIconWrapper = styled('div')<StyledIconWrapperProps>(({ status, isActivePlayer, theme }) => ({
  marginLeft: usesCompactLayout(status) ? '0.25rem' : '0.5rem',
  fontSize: usesCompactLayout(status) ? '1rem' : '2rem',
  width: usesCompactLayout(status) ? '1rem' : '2rem',
  height: usesCompactLayout(status) ? '1rem' : '2rem',
  lineHeight: '1',
  color: status === PlayerStatus.Disconnected ? theme.palette.error.main : 'inherit',
  ...(isActivePlayer
    ? null
    : {
        [theme.breakpoints.down('md')]: {
          marginLeft: '0.125rem',
          fontSize: '0.75rem',
          width: '0.75rem',
          height: '0.75rem',
        },
      }),
}))

interface AvatarFrameProps {
  isRowLayout?: boolean
  isDisconnected?: boolean
}

// In column layouts the avatar flexes into the space left by the nickname
// plate; fixed content-based sizes would overflow the fixed-height block
const avatarColumnStyles = {
  flex: '1 1 auto',
  minHeight: 0,
  height: 'auto',
}

const AvatarFrame = styled('div')<AvatarFrameProps>(({ isRowLayout, isDisconnected, theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  maxWidth: '100%',
  aspectRatio: '1',
  filter: isDisconnected ? 'grayscale(1)' : 'none',
  opacity: isDisconnected ? 0.5 : 1,
  transition: 'filter 150ms, opacity 150ms',
  // The compact opponent row keeps the avatar at full row height until the
  // mobile column layout kicks in
  ...(isRowLayout ? { height: '100%', flexShrink: 0, [theme.breakpoints.down('md')]: avatarColumnStyles } : avatarColumnStyles),
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
  ...(isActivePlayer
    ? null
    : {
        [theme.breakpoints.down('md')]: {
          fontSize: '0.625rem',
        },
      }),
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
  ...(isActivePlayer
    ? null
    : {
        [theme.breakpoints.down('md')]: {
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          height: 'auto',
          marginLeft: 0,
          marginTop: '0.125rem',
          padding: '0.125rem 0.25rem',
        },
      }),
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

  const Icon = IconByStatus[status]

  return (
    <StyledPlayer status={status} isActivePlayer={isActivePlayer}>
      <AvatarFrame isRowLayout={usesCompactLayout(status) && !isActivePlayer} isDisconnected={isDisconnected}>
        <Avatar src={avatar} alt={username} size="auto" />
      </AvatarFrame>
      <Bottom isActivePlayer={isActivePlayer} status={status} title={`${username} (${TitlePostfixByStatus[status]})`}>
        <Username isActivePlayer={isActivePlayer} status={status}>
          {username}
        </Username>
        {Icon ? (
          <StyledIconWrapper status={status} isActivePlayer={isActivePlayer}>
            <Icon fontSize="inherit" titleAccess={isDisconnected ? 'Connection lost' : undefined} />
          </StyledIconWrapper>
        ) : null}
      </Bottom>
    </StyledPlayer>
  )
}

Player.displayName = 'Player'
