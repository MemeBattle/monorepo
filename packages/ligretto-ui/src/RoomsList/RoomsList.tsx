import React from 'react'
import { createStyles, makeStyles } from '@mui/styles'
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import clsx from 'clsx'

export interface RoomsListProps {
  rooms: Array<{ onClick?: () => void; name: string; id: string; playersCount: number; playersMaxCount: number; isDisabled: boolean }>
}

const useStyles = makeStyles(theme =>
  createStyles({
    roomsList: {
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '798px',
      width: '100%',
      borderRadius: '12px',
      height: '370px',
      overflow: 'hidden',
    },
    room: {
      width: '100%',
      height: '74px',
      minHeight: '74px',
      color: theme.palette.common.white,
      display: 'flex',
      alignItems: 'center',
      fontSize: '50px',
      fontWeight: 'bold',
      background: theme.palette.primary.main,
      cursor: 'pointer',
      '&:not(:first-of-type)': {
        borderTop: 'solid 2px',
      },
    },
    disabledRoom: {
      background: theme.palette.grey[700],
      cursor: 'default',
    },
    name: {
      marginLeft: '2rem',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    players: {
      marginLeft: 'auto',
      marginRight: '2rem',
      letterSpacing: '10px',
    },
    play: {
      marginRight: '1rem',
      display: 'flex',
    },
    disabledPlay: {
      visibility: 'hidden',
    },
    '@media (max-width: 500px)': {
      name: {
        marginLeft: '0.1rem',
        fontSize: '2rem',
      },
      play: {
        marginRight: '0.1rem',
      },
      players: {
        marginRight: '0.5rem',
        letterSpacing: 'normal',
        fontSize: '2rem',
      },
    },
  }),
)

export const RoomsList: React.FC<RoomsListProps> = ({ rooms }) => {
  const classes = useStyles()

  return (
    <div className={classes.roomsList}>
      {rooms.map(({ name, id, playersCount, playersMaxCount, onClick, isDisabled }) => (
        <div title={name} className={clsx(classes.room, { [classes.disabledRoom]: isDisabled })} key={id} onClick={onClick}>
          <span className={classes.name}>{name}</span>
          <span className={classes.players}>
            {playersCount}/{playersMaxCount}
          </span>
          <div className={clsx(classes.play, { [classes.disabledPlay]: isDisabled })}>
            <PlayCircleOutlineOutlinedIcon fontSize="inherit" />
          </div>
        </div>
      ))}
    </div>
  )
}

RoomsList.displayName = 'RoomsList'
