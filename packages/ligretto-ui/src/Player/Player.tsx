import React from 'react'
import { createStyles, makeStyles } from '@mui/styles'
import { CheckCircleOutline, History } from '@mui/icons-material'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { Avatar } from '../Avatar'

export interface PlayerProps {
  username: string
  avatar?: string
  status: PlayerStatus
  isActivePlayer?: boolean
}

const useStyles = makeStyles(theme =>
  createStyles({
    player: {
      display: 'flex',
      flexDirection: ({ status, isActivePlayer }: PlayerProps) => (status === PlayerStatus.InGame && !isActivePlayer ? 'row' : 'column'),
      maxWidth: '12rem',
      alignItems: 'center',
      opacity: ({ status }: PlayerProps) => (status === PlayerStatus.DontReadyToPlay ? 0.5 : 1),
      transition: 'opacity 100ms',
      justifyContent: 'end',
    },
    bottom: {
      borderRadius: 4,
      background: theme.palette.primary.main,
      alignItems: 'center',
      display: 'flex',
      padding: '0.5rem',
      maxWidth: '100%',
      width: '100%',
      marginLeft: ({ status }: PlayerProps) => (status === PlayerStatus.InGame ? '0.75rem' : 0),
    },
    icon: {
      marginLeft: 'auto',
      fontSize: '2rem',
      width: '2rem',
      height: '2rem',
      lineHeight: '1',
    },
    username: {
      color: '#fff',
      fontSize: '1.5rem',
      textAlign: 'center',
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      marginRight: ({ status }: PlayerProps) => (status === PlayerStatus.InGame ? 0 : '0.5rem'),
      width: '100%',
    },
  }),
)

const IconByStatus = {
  [PlayerStatus.ReadyToPlay]: CheckCircleOutline,
  [PlayerStatus.DontReadyToPlay]: History,
  [PlayerStatus.InGame]: null,
}

export const Player: React.FC<PlayerProps> = props => {
  const { avatar, username, status, isActivePlayer } = props
  const classes = useStyles(props)

  const Icon = IconByStatus[status]

  return (
    <div className={classes.player}>
      <Avatar src={avatar} alt={username} size={status === PlayerStatus.InGame && !isActivePlayer ? 'small' : 'medium'} />
      <div className={classes.bottom}>
        <span className={classes.username} title={username}>
          {username}
        </span>
        {Icon ? (
          <div className={classes.icon}>
            <Icon fontSize="inherit" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

Player.displayName = 'Player'
