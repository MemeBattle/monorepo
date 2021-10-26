import type { MouseEventHandler } from 'react'
import React from 'react'
import { createStyles, makeStyles, Button } from '@material-ui/core'

import { Typography } from '../Typography'
import { Avatar } from '../Avatar'

const useStyles = makeStyles(theme =>
  createStyles({
    mainUser: {
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '14rem',
      position: 'relative',
    },
    mainUserAvatar: {
      width: '14rem',
      height: '12rem',
      maxHeight: '12rem',
      display: 'flex',
      cursor: 'pointer',
      position: 'relative',
      borderRadius: '0.8rem',
      justifyContent: 'center',
      alignItems: 'center',
    },
    image: {
      paddingBottom: '20px',
      maxWidth: '65%',
      maxHeight: '100%',
    },
    signupButton: {
      position: 'absolute',
      height: '100%',
      width: '100%',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    button: {
      width: '100%',
      marginBottom: '10px',
      textTransform: 'none',
    },
    backdrop: {
      height: '12rem',
      // background: theme.palette.grey.A700,
      background: '#2CAB61',
      position: 'absolute',
      borderRadius: '0.8rem',
      right: '-47px',
      left: '-47px',
    },
    bottom: {
      marginTop: '0.5rem',
      display: 'flex',
      justifyContent: 'center',
    },
    username: {
      fontWeight: 'bold',
      fontSize: '1.6rem',
      color: 'white',
    },
  }),
)

export interface UserInfoProps {
  img?: string
  onClick?: MouseEventHandler
  onButtonClick?: MouseEventHandler
  buttonText?: string
  username?: string
}

export const UserInfo: React.FC<UserInfoProps> = ({ img, onClick, username, onButtonClick, buttonText }) => {
  const classes = useStyles()

  const handleButtonClick: MouseEventHandler = e => {
    e.stopPropagation()
    if (onButtonClick) {
      onButtonClick(e)
    }
  }

  return (
    <div className={classes.mainUser}>
      <div className={classes.backdrop} />
      <div className={classes.mainUserAvatar} onClick={onClick}>
        <div className={classes.image}>
          <Avatar src={img} alt={username} size="auto" />
        </div>

        {username ? null : (
          <div className={classes.signupButton}>
            <Button className={classes.button} color="primary" variant="contained" size="large" onClick={handleButtonClick}>
              {buttonText}
            </Button>
          </div>
        )}
      </div>
      {username ? (
        <div className={classes.bottom}>
          <Typography className={classes.username} align="center">
            {username}
          </Typography>
        </div>
      ) : null}
    </div>
  )
}

UserInfo.displayName = 'MainUser'
